"""Empresas en México con matriz extranjera según GLEIF (tools/investigacion/extranjeras_gleif.py)."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "investigacion"))
import extranjeras_gleif as G  # noqa: E402


def reg(lei, nombre, pais, ciudad="", estado="ACTIVE"):
    return {"id": lei, "attributes": {"entity": {"legalName": {"name": nombre}, "legalAddress": {"city": ciudad, "country": pais}, "status": estado}}}


def fila(hijo, padre, tipo, estado="ACTIVE"):
    return {"Relationship.StartNode.NodeID": hijo, "Relationship.EndNode.NodeID": padre, "Relationship.RelationshipType": tipo,
            "Relationship.RelationshipStatus": estado}


def test_paginas_de_entidades_mexicanas():
    paginas = {1: {"data": [reg("A", "Filial A SA de CV", "MX", "Monterrey")], "meta": {"pagination": {"lastPage": 2}}},
               2: {"data": [reg("B", "Filial B", "MX")], "meta": {"pagination": {"lastPage": 2}}}}
    pedidas = []

    def consultar(url):
        pedidas.append(url)
        return json.dumps(paginas[int(url.split("page%5Bnumber%5D=")[1].split("&")[0])])
    mx = G.entidades_mx(consultar)
    assert set(mx) == {"A", "B"} and mx["A"]["ciudad"] == "Monterrey" and len(pedidas) == 2


def test_matriz_ultima_antes_que_directa_y_solo_activas():
    mx = {"A": {}, "B": {}, "C": {}}
    filas = [fila("A", "P1", "IS_DIRECTLY_CONSOLIDATED_BY"), fila("A", "P2", "IS_ULTIMATELY_CONSOLIDATED_BY"),
             fila("B", "P3", "IS_INTERNATIONAL_BRANCH_OF"), fila("C", "P4", "IS_ULTIMATELY_CONSOLIDATED_BY", "INACTIVE"),
             fila("Z", "P5", "IS_ULTIMATELY_CONSOLIDATED_BY"), fila("A", "F", "IS_FUND-MANAGED_BY")]
    assert G.matrices(filas, mx) == {"A": ("P2", "IS_ULTIMATELY_CONSOLIDATED_BY"), "B": ("P3", "IS_INTERNATIONAL_BRANCH_OF")}


def test_solo_matrices_fuera_de_mexico():
    mx = {"A": {"nombre": "Filial A", "ciudad": "CDMX", "estado": "ACTIVE"}, "B": {"nombre": "Sucursal B", "ciudad": "", "estado": "ACTIVE"},
          "C": {"nombre": "Nacional C", "ciudad": "", "estado": "ACTIVE"}}
    elegido = {"A": ("P1", "IS_ULTIMATELY_CONSOLIDATED_BY"), "B": ("P2", "IS_INTERNATIONAL_BRANCH_OF"), "C": ("P3", "IS_ULTIMATELY_CONSOLIDATED_BY")}
    padres = {"P1": {"nombre": "Matriz Israel", "pais": "IL"}, "P2": {"nombre": "Bank DE", "pais": "DE"}, "P3": {"nombre": "Grupo MX", "pais": "MX"}}
    r = G.armar(mx, elegido, padres, lambda iso: {"IL": "Israel", "DE": "Alemania"}[iso])
    assert [(x["filial"], x["iso"], x["pais"], x["relacion"]) for x in r] == [("Sucursal B", "DE", "Alemania", "sucursal"), ("Filial A", "IL", "Israel", "filial")]


def test_url_del_archivo_de_relaciones():
    assert G.url_relaciones({"data": {"rr": {"full_file": {"csv": {"url": "https://x/rr.csv.zip"}}}}}) == "https://x/rr.csv.zip"
