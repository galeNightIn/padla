---
title: SQLAlchemy на psycopg 3 и asyncpg — бенчмарки с PgBouncer и без
description: Сравнение psycopg 3 и asyncpg под SQLAlchemy через PgBouncer и напрямую, и пара граблей, на которые я наступил по пути.
date: 2026-06-08
---

Хотел понять, как `psycopg 3` и `asyncpg` выглядят рядом, когда оба сидят за SQLAlchemy в async-режиме, и сколько стоит PgBouncer между приложением и Postgres. Получилось четыре комбинации — `(psycopg3, asyncpg) × (direct, pgbouncer)` — и четыре эксперимента: overhead соединения, точечный SELECT, bulk insert и короткие транзакции.

Стек:

- `uv` + `pyproject.toml`
- SQLAlchemy 2.0 async (`create_async_engine`)
- `psycopg[binary]>=3.2` и `asyncpg>=0.29`
- `pytest-benchmark`
- Postgres 16 и PgBouncer 1.22 в `transaction` pool mode

Код целиком: [galeNightIn/perfomance-experiments](https://github.com/galeNightIn/perfomance-experiments).

## Pyproject

```toml
[project]
name = "perfomance-experiments"
requires-python = ">=3.11"
dependencies = [
    "sqlalchemy[asyncio]>=2.0.30",
    "psycopg[binary]>=3.2",
    "asyncpg>=0.29",
]

[dependency-groups]
dev = ["pytest>=8.2", "pytest-benchmark>=4.0"]
```

## Конфиг подключения

Две оси — драйвер и точка входа — заворачиваю в одну функцию:

```python
DRIVERS = ("psycopg3", "asyncpg")
MODES = ("direct", "pgbouncer")

_DIALECTS = {
    "psycopg3": "postgresql+psycopg",
    "asyncpg":  "postgresql+asyncpg",
}

def get_dsn(driver: str, mode: str) -> str:
    user = os.environ.get("PGUSER", "bench")
    password = os.environ.get("PGPASSWORD", "bench")
    database = os.environ.get("PGDATABASE", "bench")
    if mode == "direct":
        host = os.environ.get("DIRECT_HOST", "127.0.0.1")
        port = os.environ.get("DIRECT_PORT", "5432")
    else:
        host = os.environ.get("PGBOUNCER_HOST", "127.0.0.1")
        port = os.environ.get("PGBOUNCER_PORT", "6432")
    return f"{_DIALECTS[driver]}://{user}:{password}@{host}:{port}/{database}"
```

## Движок и грабли с PgBouncer в transaction-режиме

PgBouncer в `transaction` pool mode мультиплексирует серверные соединения между клиентами — server-side prepared statements между транзакциями не выживают. У каждого драйвера свой переключатель:

```python
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

def make_engine(driver, mode, *, nullpool=False, **kwargs):
    connect_args = dict(kwargs.pop("connect_args", {}))
    engine_kwargs = {}
    url = get_dsn(driver, mode)

    if mode == "pgbouncer":
        if driver == "psycopg3":
            # выключаем автоматический PREPARE после N запусков
            connect_args.setdefault("prepare_threshold", None)
        elif driver == "asyncpg":
            # внутренний кэш самого asyncpg
            connect_args.setdefault("statement_cache_size", 0)
            # а вот это — не kwarg create_async_engine, а URL-параметр диалекта
            url += "?prepared_statement_cache_size=0"

    if nullpool:
        engine_kwargs["poolclass"] = NullPool

    return create_async_engine(url, connect_args=connect_args, **engine_kwargs)
```

Подстава с `prepared_statement_cache_size`: в актуальной документации SQLAlchemy его подают как kwarg `create_async_engine(...)`, но на версии 2.0.50 диалект asyncpg принимает его только через query-string URL'а. Передаёшь в Python — получаешь:

```
TypeError: Invalid argument(s) 'prepared_statement_cache_size' sent to create_engine(),
using configuration PGDialect_asyncpg/NullPool/Engine.
```

В исходниках `sqlalchemy/dialects/postgresql/asyncpg.py` ровно так:

```python
prepared_statement_cache_size = kw.pop("prepared_statement_cache_size", 100)
```

`kw` тут — словарь опций URL'а, не Python kwargs.

## Фикстуры

asyncpg-соединения привязаны к event loop'у, в котором их создали, — заводим один сессионный, общий для всех движков и тестов:

```python
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()

@pytest.fixture(scope="session", params=DRIVERS)
def driver(request): return request.param

@pytest.fixture(scope="session", params=MODES)
def mode(request): return request.param

@pytest.fixture(scope="session")
def engine(driver, mode, event_loop):
    eng = make_engine(driver, mode)
    event_loop.run_until_complete(ensure_schema(eng))
    event_loop.run_until_complete(seed_read(eng))
    yield eng
    event_loop.run_until_complete(eng.dispose())
```

Каждая фикстура отрабатывает 4 раза — по одной на `(driver, mode)`. `pytest-benchmark` сам группирует все 16 точек по экспериментам.

## Эксперимент: connection overhead

`NullPool` отключает клиентский пул, и каждый round заходит на сервер с нуля — это та нагрузка, где PgBouncer должен светиться:

```python
def test_connect_and_select1(benchmark, driver, mode, event_loop):
    engine = make_engine(driver, mode, nullpool=True)

    async def connect_and_query():
        async with engine.connect() as conn:
            return (await conn.execute(text("SELECT 1"))).scalar_one()

    def run():
        return event_loop.run_until_complete(connect_and_query())

    try:
        assert benchmark(run) == 1
    finally:
        event_loop.run_until_complete(engine.dispose())
```

Локально на Postgres 16 + PgBouncer 1.22, single client:

| Driver   | Mode      | median   |
| -------- | --------- | -------- |
| psycopg3 | pgbouncer | 2.12 ms  |
| asyncpg  | pgbouncer | 2.88 ms  |
| psycopg3 | direct    | 10.47 ms |
| asyncpg  | direct    | 33.92 ms |

`asyncpg-direct` самый медленный — asyncpg на каждое новое соединение лезет интроспектировать каталог типов. PgBouncer прячет эту цену за warm-серверным коннектом.

## Эксперимент: bulk insert — где наступил особенно громко

Первая версия — «нормальный SQLAlchemy executemany»:

```python
_INSERT = text(
    "INSERT INTO bench_write (id, name, value) VALUES (:id, :name, :value)"
)

async def bulk_insert():
    async with engine.begin() as conn:
        await conn.execute(_INSERT, rows)  # 5000 dict'ов
```

CI выдаёт:

| Driver   | Mode      | median    |
| -------- | --------- | --------- |
| asyncpg  | direct    | 44.51 ms  |
| asyncpg  | pgbouncer | 46.38 ms  |
| psycopg3 | direct    | 881.51 ms |
| psycopg3 | pgbouncer | 936.21 ms |

`psycopg3` в **20 раз медленнее** asyncpg на одном и том же запросе. Полез в исходники:

```python
# sqlalchemy/dialects/postgresql/psycopg.py:473
self.insert_executemany_returning = False

# и дальше в async-обёртке:
def executemany(self, query, params_seq):
    return self.await_(self._cursor.executemany(query, params_seq))
```

С `insert_executemany_returning=False` SQLAlchemy не пускает запрос через `insertmanyvalues`-перезапись и зовёт `cursor.executemany` напрямую. У psycopg 3 в этом сценарии — один Execute на строку без pipeline. У asyncpg `executemany` дефолтно пайплайнит, поэтому он и был быстрым. То есть 20x — это артефакт диалекта, а не разница между драйверами.

Лечится переходом на одну multi-VALUES вставку через Core:

```python
from sqlalchemy import insert
from perf_common.schema import bench_write

stmt = insert(bench_write).values(rows)

async def bulk_insert():
    async with engine.begin() as conn:
        await conn.execute(stmt)
```

`insert(table).values([rows])` рендерится в `INSERT INTO bench_write (...) VALUES (...), (...), ...` — один statement, один round trip. Оба драйвера идут одной дорогой:

| Driver   | Mode      | median  |
| -------- | --------- | ------- |
| asyncpg  | direct    | 275 ms  |
| asyncpg  | pgbouncer | 283 ms  |
| psycopg3 | direct    | 310 ms  |
| psycopg3 | pgbouncer | 317 ms  |

Разрыв 1.1–1.2x вместо 20x. Цена за честность: asyncpg в абсолюте просел (~44 ms → ~275 ms) — старая цифра ехала на нативном пайплайне `executemany`, который не переносится между драйверами. Это нормальное состояние «бенчмаркаешь идиоматичный SQLAlchemy», но если интересно именно «выжать драйвер до предела», на каждый драйвер нужен отдельный эксперимент со своими хаками (psycopg `Connection.pipeline()`, asyncpg `COPY`).

## CI и ещё одни грабли — pgbouncer auth

PgBouncer как service container в GitHub Actions сначала падал на:

```
FATAL: server login failed: wrong password type
```

При `AUTH_TYPE: md5` образ `edoburu/pgbouncer` сохраняет в userlist только md5-хэш пароля. Postgres 16 по умолчанию хранит пароли как `scram-sha-256`, и на SCRAM-челлендж от Postgres'а у PgBouncer'а просто нечем ответить — plaintext'а у него нет. Лечится `AUTH_TYPE: plain`:

```yaml
pgbouncer:
  image: edoburu/pgbouncer:latest
  env:
    DB_HOST: postgres
    DB_USER: bench
    DB_PASSWORD: bench
    DB_NAME: bench
    AUTH_TYPE: plain
    POOL_MODE: transaction
  ports:
    - 6432:6432
```

С `plain` userlist хранит plaintext, и PgBouncer спокойно делает SCRAM до Postgres'а. Cleartext ходит только по loopback внутри эфемерного раннера, поэтому жертва приемлемая.

## Что выносить

- PgBouncer в `transaction` mode требует выключать prepared statements на стороне драйвера. Для psycopg 3 — `prepare_threshold=None` в `connect_args`. Для asyncpg — `statement_cache_size=0` в `connect_args` **плюс** `?prepared_statement_cache_size=0` в URL.
- Bulk insert через `text(...)` + список диктов даёт фальшиво плохие цифры для psycopg 3 под SQLAlchemy async. Используй `insert(table).values([...])`, и драйверы выровняются.
- Перед Postgres 16 ставь PgBouncer с `AUTH_TYPE: plain` или клади plaintext в userlist руками — иначе SCRAM-челлендж от Postgres'а развалит апстрим.
- `prepared_statement_cache_size` у asyncpg-диалекта в SQLAlchemy 2.0.x задаётся URL-параметром, не Python kwarg'ом, что бы там ни писали в доках на главной странице.

PgBouncer полезен ровно там, где он создавался — много короткоживущих соединений с дорогим handshake'ом. На warm-пуле клиента он добавляет только хоп.
