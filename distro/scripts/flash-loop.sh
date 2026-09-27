#!/usr/bin/env bash
# Flash the newest ScratchLab ISO onto USB sticks one after another.
# Plug a stick, confirm device + size, it gets written, verified (read-back
# checksum) and powered off; pull it, plug the next. q + Enter quits.
set -euo pipefail
cd "$(dirname "$0")/.."

iso=$(ls -t out/*.iso 2>/dev/null | head -n1 || true)
[ -n "$iso" ] || { echo "No ISO in out/ — run: just build"; exit 1; }
size=$(stat -c %s "$iso")
min=$size                              # stick must hold the ISO
max=$((256 * 1024 * 1024 * 1024))      # anything bigger is not a stick
echo "ISO: $iso ($(numfmt --to=iec "$size"))"
printf 'Computing ISO checksum... '
want=$(sha256sum < "$iso" | cut -d' ' -f1)
echo ok

sudo true                                  # ask the sudo password once
( while sleep 50; do sudo -n true 2>/dev/null || exit; done ) >/dev/null 2>&1 &
keepalive=$!
trap 'kill $keepalive 2>/dev/null; echo; summary' EXIT

ok=(); failed=(); skipped=()
summary() {
    echo "== Done: ${#ok[@]} ok, ${#failed[@]} failed, ${#skipped[@]} skipped =="
    for s in "${failed[@]}"; do echo "  FAILED: $s"; done
}

usb_disks() { lsblk -dnpo NAME,TRAN,TYPE | awk '$2=="usb" && $3=="disk" {print $1}'; }
describe() { lsblk -dno MODEL,SIZE "$1" | sed 's/  */ /g; s/^ //'; }

# Returns (via $dev) the next USB disk not in $ignore; q + Enter quits.
wait_for_stick() {
    dev=""
    echo
    echo "== Plug in a stick (q + Enter to quit) =="
    while [ -z "$dev" ]; do
        for d in $(usb_disks); do
            [[ " ${ignore[*]} " == *" $d "* ]] || { dev=$d; break; }
        done
        [ -n "$dev" ] && break
        if read -r -t 1 key; then
            [ "$key" = q ] && exit 0
        elif [ $? -le 128 ]; then
            sleep 1                      # stdin closed: keep waiting, don't spin
        fi
        # forget ignored sticks that were unplugged
        local keep=()
        for d in "${ignore[@]}"; do [ -b "$d" ] && keep+=("$d"); done
        ignore=("${keep[@]}")
    done
    sleep 2                              # let the desktop settle (automount)
}

wait_for_removal() {
    echo "Pull $1 out."
    while [ -b "$1" ]; do sleep 1; done
}

ignore=()
while :; do
    wait_for_stick
    bytes=$(lsblk -dnbo SIZE "$dev")
    desc=$(describe "$dev")
    echo
    lsblk -o NAME,SIZE,MODEL,LABEL,FSTYPE,MOUNTPOINTS "$dev"
    if [ "$bytes" -lt "$min" ] || [ "$bytes" -gt "$max" ]; then
        echo "!! $dev ($desc) has the wrong size for a stick — skipping."
        skipped+=("$dev $desc"); ignore+=("$dev"); continue
    fi
    echo
    read -r -p ">> Write ScratchLab to $dev [$desc]? (y = yes, n = skip, q = quit) " ans
    case "$ans" in
        y|Y) ;;
        q|Q) exit 0 ;;
        *) echo "Skipped $dev."; skipped+=("$dev $desc"); ignore+=("$dev"); continue ;;
    esac

    # unmount anything the desktop auto-mounted
    for p in $(lsblk -lnpo NAME,MOUNTPOINTS "$dev" | awk 'NF>1 {print $1}'); do
        udisksctl unmount -b "$p" >/dev/null 2>&1 || sudo umount "$p"
    done

    echo "Writing $dev ..."
    if ! sudo dd if="$iso" of="$dev" bs=4M conv=fsync oflag=direct status=progress; then
        echo "!! Write FAILED on $dev"; printf '\a'
        failed+=("$dev $desc (write)"); wait_for_removal "$dev"; continue
    fi

    printf 'Verifying (read-back) ... '
    blocks=$(( (size + 4194303) / 4194304 ))
    got=$( { sudo dd if="$dev" bs=4M count="$blocks" iflag=direct status=none || true; } \
           | head -c "$size" | sha256sum | cut -d' ' -f1 )
    if [ "$got" = "$want" ]; then
        echo "OK"
        ok+=("$dev $desc")
        echo "== ${#ok[@]} stick(s) done =="
    else
        echo "MISMATCH — bad stick?"
        failed+=("$dev $desc (verify)")
    fi
    printf '\a'

    for p in $(lsblk -lnpo NAME,MOUNTPOINTS "$dev" | awk 'NF>1 {print $1}'); do
        udisksctl unmount -b "$p" >/dev/null 2>&1 || true
    done
    udisksctl power-off -b "$dev" >/dev/null 2>&1 || sync
    wait_for_removal "$dev"
done
