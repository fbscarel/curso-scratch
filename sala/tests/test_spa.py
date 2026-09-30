"""SPA serving: the bundle, the fallback, the admin meta and the missing build."""

from __future__ import annotations

import pytest
from flask import abort

from app import create_app
from app.auth import CSRF_HEADER

ADMIN_BASE_META = '<meta name="sala-admin-base" content="/professor-teste">'
INDEX_MARK = '<div id="root">'


def test_root_serves_the_index_and_never_caches_it(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.mimetype == "text/html"
    assert INDEX_MARK in response.get_data(as_text=True)
    assert "sala-admin-base" not in response.get_data(as_text=True)
    assert response.headers["Cache-Control"] == "no-store"


def test_index_html_by_name_is_the_index_and_never_caches_it(client):
    # `/` and `/index.html` are the same shell: the second path must not carry
    # send_file's weaker cache policy instead of the index's no-store.
    response = client.get("/index.html")

    assert response.status_code == 200
    assert response.mimetype == "text/html"
    assert INDEX_MARK in response.get_data(as_text=True)
    assert "sala-admin-base" not in response.get_data(as_text=True)
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("path", ["/", "/quem-sou-eu", "/qualquer"])
def test_public_routes_get_the_index_without_the_admin_meta(client, path):
    response = client.get(path)

    assert response.status_code == 200
    assert INDEX_MARK in response.get_data(as_text=True)
    assert ADMIN_BASE_META not in response.get_data(as_text=True)


@pytest.mark.parametrize("path", ["/professor-teste", "/professor-teste/alunos", "/professor-teste/"])
def test_admin_routes_get_the_index_with_the_admin_meta(client, path):
    response = client.get(path)

    assert response.status_code == 200
    assert ADMIN_BASE_META in response.get_data(as_text=True)


def test_the_admin_path_is_never_in_a_public_response(client):
    for path in ("/", "/quem-sou-eu", "/qualquer", "/assets/app.js"):
        assert b"/professor-teste" not in client.get(path).data, path


def test_assets_are_served_with_an_immutable_cache(client):
    response = client.get("/assets/app.js")

    assert response.status_code == 200
    assert "console.log" in response.get_data(as_text=True)
    assert "immutable" in response.headers["Cache-Control"]
    assert "max-age=" in response.headers["Cache-Control"]


def test_a_missing_asset_is_404(client):
    assert client.get("/assets/nada.js").status_code == 404


def test_a_missing_file_is_not_the_index(client):
    response = client.get("/x.js")

    assert response.status_code == 404
    assert INDEX_MARK not in response.get_data(as_text=True)


def test_a_missing_page_is_a_pt_br_html_404(client):
    # Flask's own 404 is an English page, and a kid who mistypes a URL with an
    # extension reads it.
    response = client.get("/x.js")

    assert response.status_code == 404
    assert response.mimetype == "text/html"
    assert "Não encontrei essa página." in response.get_data(as_text=True)


def test_a_wrong_method_on_a_page_is_a_pt_br_html_405(client, csrf_of):
    response = client.post("/", headers={CSRF_HEADER: csrf_of(client)})

    assert response.status_code == 405
    assert response.mimetype == "text/html"
    assert "Esse endereço não aceita esse tipo de pedido." in response.get_data(as_text=True)


def test_a_forbidden_page_is_a_pt_br_html_403(app):
    # Not every page error is a 404 or a 405: a 403 a view raises is read too.
    @app.get("/proibido")
    def _forbidden():
        abort(403)

    response = app.test_client().get("/proibido")

    assert response.status_code == 403
    assert response.mimetype == "text/html"
    assert "Você não pode fazer isso." in response.get_data(as_text=True)


def test_a_broken_page_is_a_pt_br_html_500(app):
    @app.get("/quebrado")
    def _broken():
        abort(500)

    response = app.test_client().get("/quebrado")

    assert response.status_code == 500
    assert response.mimetype == "text/html"
    assert "Algo deu errado no servidor." in response.get_data(as_text=True)


@pytest.mark.parametrize(
    ("status", "message"),
    [
        (400, "Pedido inválido."),
        (409, "Algo deu errado (erro 409)."),
        (413, "Arquivo grande demais."),
    ],
)
def test_any_page_error_status_gets_a_pt_br_html_page(app, status, message):
    # 403/404/405/500 have wording of their own; a status the app has none for
    # (409 here) still gets a pt-BR page rather than Flask's English one, and a
    # 413 is a status a kid's upload can really reach.
    @app.get(f"/erro-{status}")
    def _error():
        abort(status)

    response = app.test_client().get(f"/erro-{status}")

    assert response.status_code == status
    assert response.mimetype == "text/html"
    assert message in response.get_data(as_text=True)


def test_a_page_error_status_on_an_api_path_stays_json(app):
    @app.get("/api/erro-413")
    def _big():
        abort(413)

    response = app.test_client().get("/api/erro-413")

    assert response.status_code == 413
    assert response.mimetype == "application/json"
    assert "error" in response.get_json()


def test_an_unhandled_exception_on_a_page_is_a_pt_br_html_500(app):
    # A view that blows up rather than aborting: Flask wraps it in a 500 before
    # the handler sees it, and a kid still reads pt-BR.
    @app.get("/explode")
    def _explode():
        raise RuntimeError("boom")

    app.config["PROPAGATE_EXCEPTIONS"] = False
    response = app.test_client().get("/explode")

    assert response.status_code == 500
    assert response.mimetype == "text/html"
    assert "Algo deu errado no servidor." in response.get_data(as_text=True)


def test_a_broken_api_route_is_a_json_500(app):
    @app.get("/api/quebrado")
    def _broken_api():
        abort(500)

    response = app.test_client().get("/api/quebrado")

    assert response.status_code == 500
    assert response.mimetype == "application/json"
    assert response.get_json()["error"] == "Algo deu errado no servidor."


def test_a_file_the_build_put_at_the_root_is_served(client, dist_dir):
    # web/public/* lands at the root of dist, and the favicon is asked for by
    # name: it is a file, not a route, so it must not be the index.
    (dist_dir / "favicon.svg").write_text("<svg/>", encoding="utf-8")

    response = client.get("/favicon.svg")

    assert response.status_code == 200
    assert response.mimetype == "image/svg+xml"
    assert response.get_data(as_text=True) == "<svg/>"


@pytest.mark.parametrize(
    "url",
    ["/.secret.txt", "/.vite/manifest.json", "/assets/.secret.js", "/assets/.vite/manifest.json"],
)
def test_a_dotfile_the_build_left_in_dist_is_not_served(client, dist_dir, url):
    # A dotfile the build left behind (Vite's own .vite/manifest.json, say) is
    # not a file the build means to publish: the root-file branch and the
    # `/assets/` branch both refuse it.
    (dist_dir / ".secret.txt").write_text("segredo", encoding="utf-8")
    (dist_dir / ".vite").mkdir()
    (dist_dir / ".vite" / "manifest.json").write_text("{}", encoding="utf-8")
    (dist_dir / "assets" / ".secret.js").write_text("segredo2", encoding="utf-8")
    (dist_dir / "assets" / ".vite").mkdir()
    (dist_dir / "assets" / ".vite" / "manifest.json").write_text("{}", encoding="utf-8")

    response = client.get(url)

    assert response.status_code == 404
    assert response.mimetype == "text/html"
    assert "Não encontrei essa página." in response.get_data(as_text=True)
    assert "segredo" not in response.get_data(as_text=True)


@pytest.mark.parametrize("name", ["index.html", ".vite/manifest.json"])
def test_the_static_alias_does_not_serve_the_bundle(client, dist_dir, name):
    # Flask's own static route used to serve the whole bundle under `/static/`
    # -- `index.html` and the build's dotfiles included, and with a cache
    # policy of its own. The app has no static folder now: `/static/` is just
    # another page path, and the files under it are not there.
    (dist_dir / ".vite").mkdir()
    (dist_dir / ".vite" / "manifest.json").write_text("segredo", encoding="utf-8")

    response = client.get(f"/static/{name}")

    assert response.status_code == 404
    assert response.mimetype == "text/html"
    assert "Não encontrei essa página." in response.get_data(as_text=True)
    assert "segredo" not in response.get_data(as_text=True)
    assert INDEX_MARK not in response.get_data(as_text=True)


@pytest.mark.parametrize("path", ["/api/nada", "/api/nada/mais", "/professor-teste/api/nada"])
def test_an_unknown_api_route_is_a_json_404(client, path):
    response = client.get(path)

    assert response.status_code == 404
    assert "error" in response.get_json()


def test_a_method_the_route_does_not_accept_is_a_json_405(client, csrf_of):
    response = client.post("/api/students", headers={CSRF_HEADER: csrf_of(client)})

    assert response.status_code == 405
    assert "error" in response.get_json()


@pytest.mark.parametrize("path", ["/", "/quem-sou-eu", "/professor-teste"])
def test_a_missing_bundle_is_a_503_in_plain_text(config, tmp_path, path):
    app = create_app(config, dist_dir=tmp_path / "sem-dist")
    app.config["TESTING"] = True

    response = app.test_client().get(path)

    assert response.status_code == 503
    assert response.mimetype == "text/plain"
    assert "just web-build" in response.get_data(as_text=True)


def test_the_bundle_directory_can_come_from_the_environment(config, tmp_path, monkeypatch):
    other = tmp_path / "outro-dist"
    other.mkdir()
    (other / "index.html").write_text("<html><head></head><body>outro site</body></html>", encoding="utf-8")
    monkeypatch.setenv("SALA_DIST", str(other))

    response = create_app(config).test_client().get("/")

    assert response.status_code == 200
    assert "outro site" in response.get_data(as_text=True)
