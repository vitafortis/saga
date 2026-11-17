#!/bin/sh
# sagacp: share files and text through Saga, and fetch them by code.
# Server: __SAGA_URL__ (override with SAGA_URL)
#
#   sagacp photo.jpg notes.txt     share files (prints links, copies the last one)
#   sagacp ./configs/              share a folder as .tar.gz
#   journalctl -n 200 | sagacp     share text from a pipe
#   sagacp 12345678                fetch: files and collections are saved here, text goes to stdout
#   sagacp --install 12345678      install a collection's files (--dry-run to preview, --root for /etc)
#
# Options: -e/--expire 10m|1h|1d|7d|30d|never  -1/--once  -k/--keep  -n/--name NAME  -q/--quiet  --no-copy
# API key (Saga > Settings > API keys): SAGA_TOKEN, or the first line of ~/.config/saga/token
set -eu

SAGA_URL=${SAGA_URL:-'__SAGA_URL__'}
SAGA_URL=${SAGA_URL%/}
config="${XDG_CONFIG_HOME:-$HOME/.config}/saga/token"
token=${SAGA_TOKEN:-}
if [ -z "$token" ] && [ -r "$config" ]; then token=$(head -n 1 "$config"); fi
auth="Authorization: Bearer $token"
# Everything goes through /api/v1, the part of Saga a proxy lets through on an API key alone.
API="$SAGA_URL/api/v1"

expiry='' burn='' name='' quiet=0 copy=1 install='' dry=0 root=0

usage() {
	sed -n '2,12s/^# \{0,1\}//p' "$0" 2>/dev/null || echo "usage: sagacp [options] [file|dir|code ...]"
}
die() { echo "sagacp: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
	case $1 in
		-e | --expire) [ $# -ge 2 ] || die "$1 needs a value"; expiry=$2; shift 2 ;;
		-1 | --once) burn=1; shift ;;
		-k | --keep) burn=0; shift ;;
		-n | --name) [ $# -ge 2 ] || die "$1 needs a value"; name=$2; shift 2 ;;
		-q | --quiet) quiet=1; shift ;;
		--no-copy) copy=0; shift ;;
		-i | --install) [ $# -ge 2 ] || die "$1 needs a collection code"; install=$2; shift 2 ;;
		--dry-run) dry=1; shift ;;
		--root) root=1; shift ;;
		-h | --help) usage; exit 0 ;;
		--) shift; break ;;
		-) break ;;
		-*) die "unknown option $1 (see sagacp --help)" ;;
		*) break ;;
	esac
done

command -v curl >/dev/null 2>&1 || die "curl is required"
[ -n "$token" ] || die "no API key: create one in Saga > Settings > API keys, then put it in $config (or SAGA_TOKEN)"
case $expiry in '' | 10m | 1h | 1d | 7d | 30d | never) ;; *) die "--expire takes 10m, 1h, 1d, 7d, 30d or never" ;; esac

# Percent-encodes every byte: always valid in a URL, and needs only od.
urlencode() { printf %s "$1" | od -An -tx1 -v | tr -d ' \n' | sed 's/../%&/g'; }

query() {
	q=''
	[ -n "$expiry" ] && q="${q}&expiry=$(urlencode "$expiry")"
	[ -n "$burn" ] && q="${q}&burn=$burn"
	[ -n "$name" ] && q="${q}&title=$(urlencode "$name")"
	printf %s "${q#&}"
}

# Runs curl, prints the body on success, or the server's message on failure.
request() {
	out=$(curl -sS -w '\n%{http_code}' -H "$auth" -H 'Accept: text/plain' "$@") || die "can't reach $SAGA_URL"
	status=$(printf %s "$out" | tail -n 1)
	body=$(printf %s "$out" | sed '$d')
	case $status in
		2??) printf '%s\n' "$body" ;;
		401) die "API key not accepted: check $config (or SAGA_TOKEN), or make a new one in Settings" ;;
		*)
			msg=$(printf %s "$body" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')
			die "${msg:-${body:-HTTP $status}}" ;;
	esac
}

last=''
shared() { # shared <label> <url>
	last=$2
	if [ "$quiet" = 1 ]; then echo "$2"; return; fi
	code=${2##*/}
	printf '%s  %s  (code %s %s)\n' "$1" "$2" "$(printf %s "$code" | cut -c1-4)" "$(printf %s "$code" | cut -c5-)"
}

mimetype() { file -b --mime-type "$1" 2>/dev/null || echo application/octet-stream; }

share_file() {
	f=$1
	n=${name:-$(basename "$f")}
	url=$(request -T "$f" -H "Content-Type: $(mimetype "$f")" "$API/files/$(urlencode "$n")?$(query)")
	shared "$n" "$url"
}

share_dir() {
	d=${1%/}
	n=${name:-$(basename "$d").tar.gz}
	command -v tar >/dev/null 2>&1 || die "tar is required to share a folder"
	url=$(tar -czf - -C "$(dirname "$d")" "$(basename "$d")" | request -T - -H 'Content-Type: application/gzip' "$API/files/$(urlencode "$n")?$(query)")
	shared "$n" "$url"
}

share_stdin() {
	url=$(request --data-binary @- -H 'Content-Type: text/plain' "$API/pastes?$(query)")
	shared "${name:-text}" "$url"
}

# Downloads to a temp file first, then names it from the server's Content-Disposition,
# never overwriting: a delete-after-first-open item is gone once fetched, so it must land somewhere.
download() { # download <url> [curl options...]
	url=$1; shift
	tmp=$(mktemp ./.sagacp.XXXXXX) hdr=$(mktemp)
	if ! curl -sSf -D "$hdr" -o "$tmp" -H "$auth" "$@" "$url"; then rm -f "$tmp" "$hdr"; return 1; fi
	n=$(sed -n 's/.*filename="\([^"]*\)".*/\1/p' "$hdr" | tr -d '\r' | head -n 1)
	rm -f "$hdr"
	n=$(basename "${n:-download}")
	target=$n i=1
	while [ -e "$target" ]; do target="$n.$i"; i=$((i + 1)); done
	mv "$tmp" "$target"
	[ "$quiet" = 1 ] && echo "$target" || echo "saved $target" >&2
}

# What a code points to: paste, file or collection (and, for items, whether it burns).
resolve() { request "$API/resolve/$1"; }

fetch() { # fetch <code>
	code=$(printf %s "$1" | tr -d ' -')
	info=$(resolve "$code")
	case $info in
		*'"kind":"paste"'*)
			# Delete-after-first-open items only open with a POST.
			case $info in *'"burn":true'*) method=POST ;; *) method=GET ;; esac
			# Straight to stdout (not via request), so the text comes out byte for byte.
			curl -sSf -H "$auth" -X "$method" "$API/paste/$code/raw" || die "couldn't fetch $code" ;;
		*'"kind":"file"'*)
			case $info in *'"burn":true'*) set -- -X POST ;; *) set -- ;; esac
			download "$API/file/$code/download" "$@" || die "couldn't download $code" ;;
		*'"kind":"collection"'*)
			download "$API/collections/$code/archive" || die "couldn't download collection $code"
			[ "$quiet" = 1 ] || echo "to install its files instead: sagacp --install $code" >&2 ;;
		*) die "no item with code $code" ;;
	esac
}

install_collection() { # install_collection <code>
	code=$(printf %s "$1" | tr -d ' -')
	script=$(mktemp)
	curl -sSf -H "$auth" -o "$script" "$API/collections/$code/install.sh" || { rm -f "$script"; die "couldn't get collection $code"; }
	set -- "$script"
	[ "$dry" = 1 ] && set -- "$script" --dry-run
	# Fetched as you (with your key), then run as root only if asked.
	if [ "$root" = 1 ]; then sudo sh "$@"; else sh "$@"; fi || { rm -f "$script"; exit 1; }
	rm -f "$script"
}

copy_link() {
	[ "$copy" = 1 ] && [ -n "$last" ] && [ -t 1 ] || return 0
	for tool in pbcopy wl-copy 'xclip -selection clipboard' 'xsel -b'; do
		if command -v "${tool%% *}" >/dev/null 2>&1 && printf %s "$last" | $tool 2>/dev/null; then
			echo "link copied" >&2
			return 0
		fi
	done
}

if [ -n "$install" ]; then
	install_collection "$install"
	exit 0
elif [ $# -eq 0 ] || [ "$1" = - ]; then
	[ -t 0 ] && { usage >&2; exit 2; }
	share_stdin
else
	for arg in "$@"; do
		if [ -d "$arg" ]; then share_dir "$arg"
		elif [ -f "$arg" ]; then share_file "$arg"
		elif printf %s "$arg" | grep -Eq '^[0-9 -]{6,16}$'; then fetch "$arg"
		else die "$arg: no such file, folder or code"
		fi
	done
fi
copy_link
