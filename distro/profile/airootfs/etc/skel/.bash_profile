[ -f ~/.bashrc ] && . ~/.bashrc
# tty1 is the autologin console: go straight to the desktop.
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ "${XDG_VTNR:-0}" = 1 ]; then
    exec labwc
fi
