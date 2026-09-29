#!/usr/bin/env bash
# Stage build-time secrets into the profile (all outputs are gitignored and
# removed again by `just build` once mkarchiso finishes):
#   - password hashes for `professor` and `root` (from $PROF_PASS / $ROOT_PASS or a prompt)
#   - NetworkManager Wi-Fi connections from secrets/wifi.txt ("SSID<TAB>password" per line)
#   - the "Entregar trabalho" upload URL from secrets/entrega-url.txt (see ../entrega/README.md)
# `lab-setup` applies them inside the image.
set -euo pipefail
cd "$(dirname "$0")/.."

root_dir=profile/airootfs/root
conn_dir=profile/airootfs/etc/NetworkManager/system-connections
mkdir -p "$root_dir"

ask() {  # ask <var> <label>: use $var if set, else prompt twice
    local var=$1 label=$2 a b
    if [ -n "${!var:-}" ]; then printf '%s' "${!var}"; return; fi
    while :; do
        read -rsp "$label: " a </dev/tty; echo >/dev/tty
        read -rsp "$label (de novo): " b </dev/tty; echo >/dev/tty
        [ -n "$a" ] && [ "$a" = "$b" ] && break
        echo "As senhas não conferem (ou estão vazias). Tente de novo." >/dev/tty
    done
    printf '%s' "$a"
}

ask PROF_PASS "Senha do professor" | openssl passwd -6 -stdin > "$root_dir/professor.hash"
ask ROOT_PASS "Senha do root" | openssl passwd -6 -stdin > "$root_dir/root.hash"

rm -rf "$conn_dir"
if [ -s secrets/wifi.txt ]; then
    mkdir -p "$conn_dir"
    while IFS=$'\t' read -r ssid psk; do
        [ -z "$ssid" ] || [[ "$ssid" == \#* ]] && continue
        uuid=$(python3 -c 'import sys,uuid; print(uuid.uuid5(uuid.NAMESPACE_DNS, "scratchlab-wifi-" + sys.argv[1]))' "$ssid")
        cat > "$conn_dir/$ssid.nmconnection" <<EOF
[connection]
id=$ssid
uuid=$uuid
type=wifi
autoconnect=true

[wifi]
mode=infrastructure
ssid=$ssid

[wifi-security]
key-mgmt=wpa-psk
psk=$psk

[ipv4]
method=auto

[ipv6]
method=auto
EOF
        echo "Wi-Fi: $ssid"
    done < secrets/wifi.txt
else
    echo "Wi-Fi: secrets/wifi.txt missing — image will have no saved networks" >&2
fi

url_file=profile/airootfs/etc/scratchlab/entrega-url
rm -f "$url_file"
url=$(grep -v '^#' secrets/entrega-url.txt 2>/dev/null | tr -d '[:space:]' || true)
if [[ "$url" == https://script.google.com/macros/s/*/exec ]]; then
    mkdir -p "$(dirname "$url_file")"
    printf '%s\n' "$url" > "$url_file"
    echo "Entregar trabalho: URL configurada"
elif [ -n "$url" ]; then
    echo "secrets/entrega-url.txt: esperado https://script.google.com/macros/s/…/exec" >&2
    exit 1
else
    echo "Entregar trabalho: secrets/entrega-url.txt missing — the button will say it is not configured" >&2
fi
