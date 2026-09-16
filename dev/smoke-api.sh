#!/usr/bin/env bash
set -euo pipefail
base=http://127.0.0.1:3000

echo "== health =="
curl -fsS "$base/health"
echo

echo "== packs =="
curl -fsS "$base/api/packs"
echo

echo "== put price =="
curl -fsS -X PUT "$base/api/packs/vereinsfest" \
  -H "Content-Type: application/json" \
  -d '{"id":"vereinsfest","name":"Vereinsfest","products":[{"id":"pommes","name":"Pommes","price":3.5},{"id":"bratwurst","name":"Bratwurst","price":3},{"id":"currywurst","name":"Currywurst","price":3.5},{"id":"mantaplatte","name":"Mantaplatte","price":6.5}]}'
echo

echo "== restore =="
curl -fsS -X PUT "$base/api/packs/vereinsfest" \
  -H "Content-Type: application/json" \
  -d '{"id":"vereinsfest","name":"Vereinsfest","products":[{"id":"pommes","name":"Pommes","price":3},{"id":"bratwurst","name":"Bratwurst","price":3},{"id":"currywurst","name":"Currywurst","price":3.5},{"id":"mantaplatte","name":"Mantaplatte","price":6.5}]}'
echo
