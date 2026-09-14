#!/usr/bin/env python3
"""Run Zap OS migrations against a disposable, socket-only PostgreSQL cluster.

Requires Python 3 and local PostgreSQL binaries; never accepts a database URL.
All credentials and records are synthetic. No Supabase/WhatsApp connection.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
import uuid

REPO = Path(__file__).resolve().parents[1]
BASELINES = [
    "20260908132007_5f89d026-824a-4c7e-97e7-f25f82f932a8.sql",
    "20260908143208_0440a655-f706-495f-ba25-583f940503ea.sql",
    "20260912113826_99c0b0ab-6ddf-4119-869e-aac14c020224.sql",
    "20260912121656_d14dd4c8-a932-4fce-9990-35925c48f4e2.sql",
]


def literal(value: str | None) -> str:
    return "NULL" if value is None else "'" + value.replace("'", "''") + "'"


class Cluster:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.root = Path(tempfile.mkdtemp(prefix="zap-pg-"))
        self.data = self.root / "data"
        self.socket = self.root / "socket"
        self.socket.mkdir(mode=0o700)
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        self.env["PGCONNECT_TIMEOUT"] = "5"
        self.env["PGOPTIONS"] = "-c statement_timeout=15000 -c lock_timeout=10000"
        self.started = False
        self.passed = 0
        self.queue_order = 0

    def binary(self, name: str) -> str:
        found = str(Path(self.args.pg_bin) / name) if self.args.pg_bin else shutil.which(name)
        if not found or not Path(found).is_file():
            raise RuntimeError(f"Missing local PostgreSQL binary: {name}; use --pg-bin")
        return found

    def start(self):
        cmd = [self.binary("initdb"), "-D", str(self.data), "-U", "zap_test", "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8", "--no-sync"]
        if self.args.pg_share:
            cmd += ["-L", self.args.pg_share]
        subprocess.run(cmd, env=self.env, check=True, capture_output=True, text=True)
        options = ["-c", "listen_addresses=", "-k", str(self.socket), "-c", "unix_socket_permissions=0700", "-c", "fsync=off"]
        if self.args.pg_lib:
            options += ["-c", f"dynamic_library_path={self.args.pg_lib}"]
        subprocess.run([self.binary("pg_ctl"), "-D", str(self.data), "-l", str(self.root / "postgres.log"), "-o", shlex.join(options), "-w", "start"], env=self.env, check=True, capture_output=True, text=True)
        self.started = True
        print("PostgreSQL local:", self.sql("SHOW server_version;"), flush=True)
        assert self.sql("SELECT inet_server_addr() IS NULL;") == "t", "Expected private Unix socket"
        assert self.sql("SHOW listen_addresses;") == "", "TCP must remain disabled"
        assert Path(self.sql("SHOW data_directory;")).resolve() == self.data.resolve(), "Unexpected cluster"
        self.file(REPO / "scripts/fixtures/zap-distribuicao-schema.sql")
        for name in BASELINES:
            self.file(REPO / "supabase/migrations" / name)
        # A genuine pre-migration row must retain its explicitly stored legacy
        # value; only future rows inherit the new nullable default.
        self.legacy_clinic, users = self.fixture()
        self.legacy_agent = users[0]
        dept = str(uuid.uuid4())
        self.sql(f"INSERT INTO atend_departamentos(id,clinica_id) VALUES({literal(dept)},{literal(self.legacy_clinic)}); INSERT INTO atend_departamento_membros(clinica_id,departamento_id,user_id) VALUES({literal(self.legacy_clinic)},{literal(dept)},{literal(self.legacy_agent)});")
        assert self.sql(f"SELECT max_simultaneas FROM atend_departamento_membros WHERE clinica_id={literal(self.legacy_clinic)};") == "5"
        self.queue(self.legacy_clinic, 6, dept=dept)
        self.file(self.args.migration)
        assert self.assigned(self.legacy_clinic) == 0, "Applying the migration must not distribute existing records"

    def command(self) -> list[str]:
        return [self.binary("psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", str(self.socket), "-U", "zap_test", "-d", "postgres"]

    def source(self, query: str, user: str | None = None, role: str = "authenticated") -> str:
        if user is not None:
            assert role in {"authenticated", "anon", "service_role"}
            return f"SET ROLE {role}; SET request.jwt.claim.sub = {literal(user)}; SET request.jwt.claim.role = {literal(role)};\n{query}"
        return query

    def sql(self, query: str, user: str | None = None, role: str = "authenticated", error: bool = False) -> str:
        result = subprocess.run(self.command(), input=self.source(query, user, role), env=self.env, capture_output=True, text=True, timeout=25)
        if error:
            assert result.returncode != 0, f"Expected denial but query succeeded: {query}"
            return result.stderr
        if result.returncode:
            raise AssertionError(result.stderr + "\nSQL: " + query)
        return result.stdout.strip()

    def file(self, path: Path):
        sql = path.read_text(encoding="utf-8")
        if not sql.strip():
            raise RuntimeError(f"Migration is empty: {path}")
        self.sql(sql)

    def rpc(self, fn: str, params: str, user: str):
        return json.loads(self.sql(f"SELECT public.{fn}({params});", user))

    def case(self, name: str, fn):
        fn()
        self.passed += 1
        print(f"PASS {self.passed}: {name}", flush=True)

    def close(self):
        if self.started:
            subprocess.run([self.binary("pg_ctl"), "-D", str(self.data), "-m", "immediate", "-w", "stop"], env=self.env, capture_output=True, text=True, timeout=20)
        if self.args.keep:
            print(f"Local artifacts retained: {self.root}")
        else:
            shutil.rmtree(self.root)

    def fixture(self, roles: tuple[str, ...] = ("telefonia", "gestor")) -> tuple[str, list[str]]:
        clinic = str(uuid.uuid4())
        users = [str(uuid.uuid4()) for _ in roles]
        self.sql(f"INSERT INTO clinicas(id) VALUES ({literal(clinic)});")
        for user, role in zip(users, roles):
            self.sql(f"INSERT INTO auth.users(id) VALUES ({literal(user)}); INSERT INTO clinica_memberships(clinica_id,user_id,role) VALUES ({literal(clinic)},{literal(user)},{literal(role)});")
        return clinic, users

    def queue(self, clinic: str, count: int, *, dept: str | None = None, owner: str | None = None, is_test: bool = False) -> list[str]:
        conversations = [str(uuid.uuid4()) for _ in range(count)]
        values = []
        for conversation in conversations:
            self.queue_order += 1
            values.append(f"""({literal(conversation)},{literal(clinic)},{literal(dept)},{literal(owner)},
                {literal('active' if owner else 'waiting')},{literal('HUMAN' if owner else 'NONE')},false,{str(is_test).lower()},'SQL TEST handoff',
                now() - interval '1 hour' + {self.queue_order} * interval '1 second', now() - interval '1 hour' + {self.queue_order} * interval '1 second', {('now()' if owner else 'NULL')})""")
        self.sql("INSERT INTO atend_conversas(id,clinica_id,departamento_id,atribuida_user_id,status,owner_type,ai_enabled,is_teste,handoff_motivo,handoff_em,aguardando_desde,assigned_at) VALUES " + ",".join(values) + ";")
        return conversations

    def presence(self, clinic: str, user: str, state: str, version: int | None = None):
        return self.rpc("atend_definir_presenca_manual", f"{literal(clinic)},{literal(state)},{version if version is not None else 'NULL'}", user)

    def capacity(self, clinic: str, user: str, cap: int | None, manager: str):
        return self.rpc("atend_configurar_capacidade", f"{literal(clinic)},{literal(user)},{cap if cap is not None else 'NULL'}", manager)

    def assigned(self, clinic: str, user: str | None = None) -> int:
        who = f"atribuida_user_id = {literal(user)}" if user else "atribuida_user_id IS NOT NULL"
        return int(self.sql(f"SELECT count(*) FROM atend_conversas WHERE clinica_id = {literal(clinic)} AND {who} AND status IN ('active','waiting','in_progress') AND NOT is_teste;"))

    def overlap(self, first: str, second: str, first_user: str, second_user: str) -> tuple[str, str]:
        """Hold transaction one until transaction two completes or blocks on it.

        The SQL-session barrier avoids relying on a fixed sleep or CPU timing.
        """
        tag = "zap_race_" + uuid.uuid4().hex
        process = subprocess.Popen(self.command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env, text=True)
        other = None
        try:
            process.stdin.write(self.source(f"SET application_name = {literal(tag)}; BEGIN; {first};\n", first_user))
            process.stdin.flush()
            deadline = time.monotonic() + 10
            while self.sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name = {literal(tag)} AND state = 'idle in transaction';") != "1":
                if process.poll() is not None or time.monotonic() > deadline:
                    raise AssertionError("First transaction failed to reach its open-transaction barrier")
                time.sleep(0.025)
            other_tag = tag + "_second"
            other = subprocess.Popen(self.command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env, text=True)
            other.stdin.write(self.source(f"SET application_name = {literal(other_tag)}; BEGIN; {second}; COMMIT;\n", second_user))
            other.stdin.close()
            deadline = time.monotonic() + 10
            while other.poll() is None:
                if self.sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name = {literal(other_tag)} AND wait_event_type = 'Lock';") == "1":
                    break
                if time.monotonic() > deadline:
                    raise AssertionError("Second transaction neither completed nor reached a database lock")
                time.sleep(0.025)
            process.stdin.write("COMMIT;\n")
            process.stdin.close()
            process.wait(timeout=20)
            other.wait(timeout=20)
            first_output, first_error = process.stdout.read(), process.stderr.read()
            second_output, second_error = other.stdout.read(), other.stderr.read()
            assert process.returncode == 0, first_error
            assert other.returncode == 0, second_error
            return first_output.strip(), second_output.strip()
        finally:
            for child in (process, other):
                if child is not None and child.poll() is None:
                    child.kill()
                    child.wait(timeout=5)


def run_cases(db: Cluster):
    def unlimited():
        clinic, (agent, manager) = db.fixture()
        db.queue(clinic, 7)
        answer = db.presence(clinic, agent, "ONLINE", 0)
        assert answer["ok"] and answer["estado"] == "ONLINE", answer
        assert db.assigned(clinic, agent) == 7
        snapshot = db.rpc("atend_diagnostico_distribuicao", literal(clinic), agent)
        assert snapshot["meu"]["capacidade"] is None, snapshot
    db.case("ONLINE distributes more than five when capacity is not configured", unlimited)

    def legacy_and_new_department():
        assert db.sql(f"SELECT max_simultaneas FROM atend_departamento_membros WHERE clinica_id={literal(db.legacy_clinic)};") == "5"
        db.presence(db.legacy_clinic, db.legacy_agent, "ONLINE", 0)
        assert db.assigned(db.legacy_clinic, db.legacy_agent) == 5
        legacy = db.rpc("atend_diagnostico_distribuicao", literal(db.legacy_clinic), db.legacy_agent)
        assert legacy["meu"]["capacidade"] == 5, legacy
        clinic, (agent, manager) = db.fixture()
        dept = str(uuid.uuid4())
        db.sql(f"INSERT INTO atend_departamentos(id,clinica_id) VALUES({literal(dept)},{literal(clinic)}); INSERT INTO atend_departamento_membros(clinica_id,departamento_id,user_id) VALUES({literal(clinic)},{literal(dept)},{literal(agent)});")
        assert db.sql(f"SELECT max_simultaneas IS NULL FROM atend_departamento_membros WHERE clinica_id={literal(clinic)};") == "t"
        db.queue(clinic, 7, dept=dept)
        db.presence(clinic, agent, "ONLINE", 0)
        assert db.assigned(clinic, agent) == 7
    db.case("pre-migration department limit five is preserved; new department defaults to unlimited", legacy_and_new_department)

    def finite_and_release():
        clinic, (agent, manager) = db.fixture()
        db.capacity(clinic, agent, 5, manager)
        conversations = db.queue(clinic, 7)
        db.presence(clinic, agent, "ONLINE", 0)
        assert db.assigned(clinic, agent) == 5
        blocked = db.rpc("atend_distribuir_fila_status", f"{literal(clinic)},200", agent)
        assert blocked["distribuidas"] == 0 and blocked["pendentes"] == 2, blocked
        assert blocked["meu"]["capacidade"] == 5, blocked
        db.sql(f"UPDATE atend_conversas SET status='closed', atribuida_user_id=NULL, owner_type='AI', ai_enabled=true, closed_at=now() WHERE id={literal(conversations[0])};", agent)
        assert db.assigned(clinic, agent) == 5
        assert db.sql(f"SELECT atribuida_user_id FROM atend_conversas WHERE id={literal(conversations[5])};") == agent
        assert db.sql(f"SELECT estado_manual FROM atend_agente_presenca WHERE clinica_id={literal(clinic)} AND user_id={literal(agent)};") == "ONLINE"
    db.case("configured capacity five blocks the sixth; closing refills while still ONLINE", finite_and_release)

    def exclusions():
        clinic, users = db.fixture(("telefonia", "admin", "recepcao", "gestor"))
        agent, admin, reception, manager = users
        db.queue(clinic, 1)
        for user in (admin, reception):
            db.presence(clinic, user, "ONLINE", 0)
        db.presence(clinic, agent, "OFFLINE", 0)
        assert db.assigned(clinic) == 0
        db.presence(clinic, agent, "PAUSA", 1)
        assert db.assigned(clinic) == 0
        db.presence(clinic, agent, "ONLINE", 2)
        assert db.assigned(clinic, agent) == 1
    db.case("admin, non-telefonia, OFFLINE and PAUSA do not receive", exclusions)

    def test_and_bot():
        clinic, (agent, manager) = db.fixture()
        db.queue(clinic, 1, is_test=True)
        unmarked = db.queue(clinic, 1)[0]
        closed = db.queue(clinic, 1)[0]
        db.sql(f"UPDATE atend_conversas SET status='bot_attending',owner_type='AI',ai_enabled=true,handoff_motivo=NULL,handoff_em=NULL WHERE id={literal(unmarked)}; UPDATE atend_conversas SET status='closed' WHERE id={literal(closed)};")
        db.presence(clinic, agent, "ONLINE", 0)
        assert db.assigned(clinic, agent) == 0
        assert db.sql(f"SELECT count(*) FROM atend_conversa_eventos WHERE clinica_id={literal(clinic)} AND evento='ASSUMIDA';") == "0"
    db.case("test conversations, bot flow and closed conversations stay outside queue", test_and_bot)

    def denied():
        clinic, (agent, manager) = db.fixture()
        elsewhere, (stranger, _) = db.fixture()
        for query, user in [
            (f"SELECT atend_configurar_capacidade({literal(clinic)},{literal(agent)},5);", agent),
            (f"SELECT atend_configurar_capacidade({literal(clinic)},{literal(agent)},5);", stranger),
            (f"SELECT atend_diagnostico_distribuicao({literal(clinic)});", stranger),
            (f"SELECT atend_definir_presenca_manual({literal(clinic)},'ONLINE',0);", stranger),
            (f"SELECT atend_distribuir_fila_status({literal(clinic)},200);", stranger),
        ]:
            db.sql(query, user, error=True)
        db.sql(f"SELECT atend_diagnostico_distribuicao({literal(clinic)});", "", role="anon", error=True)
        db.capacity(clinic, agent, 5, manager)
        db.sql(f"UPDATE atend_capacidade_atendentes SET max_simultaneas=99 WHERE clinica_id={literal(clinic)};", agent, error=True)
        assert db.sql(f"SELECT count(*) FROM atend_capacidade_atendentes WHERE clinica_id={literal(clinic)};", stranger) == "0"
    db.case("RPC authorization and capacity RLS deny unauthorized/cross-clinic mutations", denied)

    def capacity_change():
        clinic, (agent, manager) = db.fixture()
        db.capacity(clinic, agent, 1, manager)
        db.queue(clinic, 3)
        db.presence(clinic, agent, "ONLINE", 0)
        assert db.assigned(clinic, agent) == 1
        db.capacity(clinic, agent, None, manager)
        assert db.assigned(clinic, agent) == 3
    db.case("manager can remove the explicit limit and release queued conversations", capacity_change)

    def incompatible_front():
        clinic, (agent_a, agent_b, manager) = db.fixture(("telefonia", "telefonia", "gestor"))
        dept_a, dept_b = str(uuid.uuid4()), str(uuid.uuid4())
        for dept, user in ((dept_a, agent_a), (dept_b, agent_b)):
            db.sql(f"INSERT INTO atend_departamentos(id,clinica_id) VALUES({literal(dept)},{literal(clinic)}); INSERT INTO atend_departamento_membros(clinica_id,departamento_id,user_id,max_simultaneas) VALUES({literal(clinic)},{literal(dept)},{literal(user)},1);")
        db.capacity(clinic, agent_a, 1, manager)
        db.capacity(clinic, agent_b, 7, manager)
        db.queue(clinic, 1, dept=dept_a, owner=agent_a)
        db.queue(clinic, 6, dept=dept_a)
        eligible = db.queue(clinic, 1, dept=dept_b)[0]
        db.presence(clinic, agent_a, "ONLINE", 0)
        db.presence(clinic, agent_b, "ONLINE", 0)
        assert db.sql(f"SELECT atribuida_user_id FROM atend_conversas WHERE id={literal(eligible)};") == agent_b
        assert db.assigned(clinic, agent_a) == 1
        assert db.assigned(clinic, agent_b) == 7
    db.case("saturated department falls back to eligible general pool before blocking", incompatible_front)

    def locked_front():
        clinic, (agent, manager) = db.fixture()
        db.presence(clinic, agent, "ONLINE", 0)
        conversations = db.queue(clinic, 7)
        locked = ",".join(literal(conversation) for conversation in conversations[:6])
        _, result = db.overlap(f"SELECT id FROM atend_conversas WHERE id IN ({locked}) FOR UPDATE", f"SELECT atend_distribuir_fila_status({literal(clinic)},200)", agent, agent)
        assert json.loads(result)["distribuidas"] == 1, result
        assert db.sql(f"SELECT atribuida_user_id FROM atend_conversas WHERE id={literal(conversations[6])};") == agent
        assert db.assigned(clinic, agent) == 1
        db.sql("SELECT atend_recuperar_distribuicao();")
        assert db.assigned(clinic, agent) == 7
        assert db.sql(f"SELECT count(*) FROM atend_distribuicao_execucoes WHERE clinica_id={literal(clinic)} AND origem='recuperacao_periodica';") == "1"
    db.case("six locked items do not block the seventh; recovery picks up released rows", locked_front)

    def concurrent_assignment():
        clinic, (agent, manager) = db.fixture()
        db.capacity(clinic, agent, 5, manager)
        db.presence(clinic, agent, "ONLINE", 0)
        db.queue(clinic, 9)
        query = f"SELECT atend_distribuir_fila_status({literal(clinic)},200)"
        db.overlap(query, query, agent, agent)
        assert db.assigned(clinic, agent) == 5
        assert db.sql(f"SELECT count(*) FROM atend_conversa_eventos WHERE clinica_id={literal(clinic)} AND evento='ASSUMIDA';") == "5"
        assert db.sql(f"SELECT count(*) FROM (SELECT conversa_id FROM atend_conversa_eventos WHERE clinica_id={literal(clinic)} AND evento='ASSUMIDA' GROUP BY conversa_id HAVING count(*)>1) x;") == "0"
    db.case("two overlapping PostgreSQL transactions preserve capacity and unique assignments", concurrent_assignment)

    def concurrent_release():
        clinic, (agent, manager) = db.fixture()
        db.capacity(clinic, agent, 5, manager)
        conversations = db.queue(clinic, 7)
        db.presence(clinic, agent, "ONLINE", 0)
        close = lambda conversation: f"UPDATE atend_conversas SET status='closed',atribuida_user_id=NULL,owner_type='AI',ai_enabled=true,closed_at=now() WHERE id={literal(conversation)}"
        db.overlap(close(conversations[0]), close(conversations[1]), agent, agent)
        # The second close does not wait in reverse lock order: it records a
        # pending distribution, and the periodic recovery fills the vacancy.
        assert db.assigned(clinic, agent) == 4
        assert db.sql(f"SELECT count(*) FROM atend_distribuicao_execucoes WHERE clinica_id={literal(clinic)} AND status='pendente' AND motivo='distribuicao_em_andamento';") == "1"
        db.sql("SELECT atend_recuperar_distribuicao();")
        assert db.assigned(clinic, agent) == 5
        assert db.sql(f"SELECT count(*) FROM atend_conversa_eventos WHERE clinica_id={literal(clinic)} AND evento='ASSUMIDA';") == "7"
        db.sql(close(conversations[0]) + ";", agent)
        assert db.sql(f"SELECT count(*) FROM atend_conversa_eventos WHERE clinica_id={literal(clinic)} AND evento='ASSUMIDA';") == "7"
    db.case("overlapping closures refill two vacancies and repeated close is idempotent", concurrent_release)

    def concurrent_presence():
        clinic, (agent, manager) = db.fixture()
        db.presence(clinic, agent, "OFFLINE", 0)
        first, second = db.overlap(f"SELECT atend_definir_presenca_manual({literal(clinic)},'ONLINE',1)", f"SELECT atend_definir_presenca_manual({literal(clinic)},'PAUSA',1)", agent, agent)
        winner, loser = json.loads(first), json.loads(second)
        assert winner["ok"] and loser["conflito"], (winner, loser)
        assert db.sql(f"SELECT estado_manual || ':' || estado_manual_versao FROM atend_agente_presenca WHERE clinica_id={literal(clinic)} AND user_id={literal(agent)};") == "ONLINE:2"
    db.case("two overlapping manual-presence writes reject the stale version atomically", concurrent_presence)

    def assignment_failure():
        clinic, (agent, manager) = db.fixture()
        db.queue(clinic, 3)
        db.sql(f"""CREATE FUNCTION fixture_fail_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.clinica_id={literal(clinic)} AND NEW.evento='ASSUMIDA' AND EXISTS (
            SELECT 1 FROM atend_conversa_eventos WHERE clinica_id=NEW.clinica_id AND evento='ASSUMIDA'
          ) THEN RAISE EXCEPTION 'SQL TEST injected second assignment failure'; END IF;
          RETURN NEW; END $$;
          CREATE TRIGGER fixture_fail_assignment BEFORE INSERT ON atend_conversa_eventos FOR EACH ROW EXECUTE FUNCTION fixture_fail_assignment();""")
        try:
            answer = db.presence(clinic, agent, "ONLINE", 0)
            assert answer["ok"] and answer["distribuicao"]["status"] == "erro", answer
            assert db.assigned(clinic, agent) == 0, "Partial first assignment must roll back"
            assert db.sql(f"SELECT count(*) FROM atend_conversa_eventos WHERE clinica_id={literal(clinic)};") == "0"
            assert db.sql(f"SELECT estado_manual FROM atend_agente_presenca WHERE clinica_id={literal(clinic)} AND user_id={literal(agent)};") == "ONLINE"
            assert db.sql(f"SELECT count(*) FROM atend_distribuicao_execucoes WHERE clinica_id={literal(clinic)} AND status='erro' AND erro_codigo='P0001';") == "1"
        finally:
            db.sql("DROP TRIGGER fixture_fail_assignment ON atend_conversa_eventos; DROP FUNCTION fixture_fail_assignment();")
        db.sql("SELECT atend_recuperar_distribuicao();")
        assert db.assigned(clinic, agent) == 3
    db.case("assignment failure rolls back its partial round, preserves ONLINE and is recovered", assignment_failure)

    def diagnostic_failure():
        clinic, (agent, manager) = db.fixture()
        db.capacity(clinic, agent, 1, manager)
        conversations = db.queue(clinic, 2)
        db.presence(clinic, agent, "ONLINE", 0)
        reason = str(uuid.uuid4())
        db.sql(f"INSERT INTO atend_pause_reasons(id,clinica_id) VALUES({literal(reason)},{literal(clinic)});")
        signature = "public.atend_distribuicao_snapshot(uuid,uuid,integer,text,text)"
        original = db.sql(f"SELECT pg_get_functiondef({literal(signature)}::regprocedure);")
        db.sql("""CREATE OR REPLACE FUNCTION public.atend_distribuicao_snapshot(
          _clinica_id uuid, _user_id uuid, _distribuidas integer DEFAULT 0,
          _status text DEFAULT NULL, _motivo text DEFAULT NULL
        ) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','pg_temp'
        AS $$ BEGIN RAISE EXCEPTION 'SQL TEST injected diagnostic failure'; END $$;""")
        try:
            db.sql(f"UPDATE atend_conversas SET status='closed',atribuida_user_id=NULL,owner_type='AI',ai_enabled=true WHERE id={literal(conversations[0])};", agent)
            assert db.sql(f"SELECT status FROM atend_conversas WHERE id={literal(conversations[0])};") == "closed"
            assert db.assigned(clinic, agent) == 0
            answer = db.presence(clinic, agent, "ONLINE", 1)
            assert answer["ok"] and answer["distribuicao"]["status"] == "erro", answer
            offline = db.presence(clinic, agent, "OFFLINE", 2)
            assert offline["ok"] and offline["estado"] == "OFFLINE" and offline["distribuicao"]["status"] == "erro", offline
            pause = db.rpc("atend_definir_presenca_manual", f"{literal(clinic)},'PAUSA',3,{literal(reason)}", agent)
            assert pause["ok"] and pause["estado"] == "PAUSA" and pause["pausaId"] and pause["distribuicao"]["status"] == "erro", pause
            assert db.sql(f"SELECT count(*) FROM atend_pausas_log WHERE clinica_id={literal(clinic)} AND reason_id={literal(reason)} AND finalizada_em IS NULL;") == "1"
            assert db.presence(clinic, agent, "ONLINE", 4)["ok"]
            assert db.sql(f"SELECT estado_manual_versao FROM atend_agente_presenca WHERE clinica_id={literal(clinic)} AND user_id={literal(agent)};") == "5"
            assert db.sql(f"SELECT count(*) FROM atend_distribuicao_execucoes WHERE clinica_id={literal(clinic)} AND status='erro';") == "5"
        finally:
            db.sql(original)
        db.sql("SELECT atend_recuperar_distribuicao();")
        assert db.assigned(clinic, agent) == 1
    db.case("diagnostic failure preserves closure, ONLINE, OFFLINE and PAUSA; retry recovers", diagnostic_failure)

    def legacy_manual_event():
        clinic, (agent, manager) = db.fixture()
        db.presence(clinic, agent, "OFFLINE", 0)
        db.queue(clinic, 1)
        db.sql(f"UPDATE atend_agente_presenca SET estado_manual='ONLINE' WHERE clinica_id={literal(clinic)} AND user_id={literal(agent)};", agent)
        assert db.assigned(clinic, agent) == 1
        assert db.sql(f"SELECT status FROM atend_agente_presenca WHERE clinica_id={literal(clinic)} AND user_id={literal(agent)};") == "OFFLINE"
    db.case("legacy update of only estado_manual triggers the canonical distributor", legacy_manual_event)

    def batch_recovery():
        clinic, (agent, manager) = db.fixture()
        db.queue(clinic, 205)
        answer = db.presence(clinic, agent, "ONLINE", 0)
        assert db.assigned(clinic, agent) == 200
        assert answer["distribuicao"]["status"] == "pendente" and answer["distribuicao"]["motivo"] == "limite_da_rodada", answer
        db.sql("SELECT atend_recuperar_distribuicao();")
        assert db.assigned(clinic, agent) == 205
    db.case("a queue larger than the round limit is completed by recovery", batch_recovery)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", help="Directory containing postgres/initdb/pg_ctl/psql")
    parser.add_argument("--pg-share", help="PostgreSQL share directory for extracted runtimes")
    parser.add_argument("--pg-lib", help="PostgreSQL library directory for extracted runtimes")
    parser.add_argument("--migration", type=Path, default=REPO / "supabase/migrations/20260914211605_zap_distribuicao_capacidade_presenca_atomica.sql")
    parser.add_argument("--keep", action="store_true", help="Keep stopped LOCAL cluster for inspection")
    args = parser.parse_args()
    db = Cluster(args)
    try:
        db.start()
        run_cases(db)
        print(f"\n{db.passed} PostgreSQL regression cases passed; no live connections.")
    except subprocess.CalledProcessError as error:
        print(error.stdout or "")
        print(error.stderr or "")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
