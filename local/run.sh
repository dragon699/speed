#!/bin/bash


ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
RELAY_PORT=8080
WEB_PORT=3000
DEVICE_KEY="local-development-device-key-0000000000"


function prepare() {
    if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
        echo " > Creating Python virtualenv.."
        python3 -m venv --without-pip "${VENV_DIR}"
    fi

    echo " > Installing relay dependencies.."
    python3 -m pip --python "${VENV_DIR}/bin/python" install -q \
        -r "${ROOT_DIR}/common/requirements.txt" \
        -r "${ROOT_DIR}/relay/requirements.txt"

    if [[ ! -d "${ROOT_DIR}/web/node_modules" ]]; then
        echo " > Installing web dependencies.."
        npm --prefix "${ROOT_DIR}/web" install --no-audit --no-fund
    fi
}


function run() {
    cd "${ROOT_DIR}"

    echo " > Starting relay on :${RELAY_PORT}.."
    DEVICE_KEY="${DEVICE_KEY}" \
    LISTEN_PORT="${RELAY_PORT}" \
    LOG_FORMAT=logfmt \
    RECORDINGS_DIR="${ROOT_DIR}/recordings" \
        "${VENV_DIR}/bin/python" -m relay.app &
    RELAY_PID=$!
    trap 'kill ${RELAY_PID} 2>/dev/null' EXIT

    echo " > Open http://localhost:${WEB_PORT}/#key=${DEVICE_KEY} once, then /car and /phone"
    RELAY_URL="http://localhost:${RELAY_PORT}" npm --prefix "${ROOT_DIR}/web" run dev -- --port "${WEB_PORT}" --strictPort
}


prepare
run
