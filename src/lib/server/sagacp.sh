#!/bin/sh
# sagacp: share files and text through Saga, and fetch them by code.
# Server: __SAGA_URL__ (override with SAGA_URL)
#
#   sagacp photo.jpg notes.txt     share files (prints links, copies the last one)
#   sagacp ./configs/              share a folder as .tar.gz
#   journalctl -n 200 | sagacp     share text from a pipe
#   sagacp 12345678                fetch: files and collections are saved here, text goes to stdout
#
# Options: -e/--expire 10m|1h|1d|7d|30d|never  -1/--once  -k/--keep  -n/--name NAME  -q/--quiet  --no-copy
# Token (when Saga has a password): SAGA_TOKEN, or the first line of ~/.config/saga/token
set -eu

SAGA_URL=${SAGA_URL:-'__SAGA_URL__'}
SAGA_URL=${SAGA_URL%/}
config="${XDG_CONFIG_HOME:-$HOME/.config}/saga/token"
token=${SAGA_TOKEN:-}
if [ -z "$token" ] && [ -r "$config" ]; then token=$(head -n 1 "$config"); fi
# One header either way, so curl never gets an empty argument.
auth="X-Saga-Client: sagacp"
[ -n "$token" ] && auth="Authorization: Bearer $token"

expiry='' burn='' name='' quiet=0 copy=1

usage() {
	sed -n '2,11s/^# \{0,1\}//p' "$0" 2>/dev/null || echo "usage: sagacp [options] [file|dir|code ...]"
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
		-h | --help) usage; exit 0 ;;
		--) shift; break ;;
		-) break ;;
		-*) die "unknown option $1 (see sagacp --help)" ;;
		*) break ;;
	esac
done

command -v curl >/dev/null 2>&1 || die "curl is required"
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
		401) die "not signed in: set SAGA_TOKEN (Saga's SAGA_API_TOKEN), or put it in $config" ;;
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
	url=$(request -T "$f" -H "Content-Type: $(mimetype "$f")" "$SAGA_URL/api/files/$(urlencode "$n")?$(query)")
	shared "$n" "$url"
}

share_dir() {
	d=${1%/}
	n=${name:-$(basename "$d").tar.gz}
	command -v tar >/dev/null 2>&1 || die "tar is required to share a folder"
	url=$(tar -czf - -C "$(dirname "$d")" "$(basename "$d")" | request -T - -H 'Content-Type: application/gzip' "$SAGA_URL/api/files/$(urlencode "$n")?$(query)")
	shared "$n" "$url"
}

share_stdin() {
	url=$(request --data-binary @- -H 'Content-Type: text/plain' "$SAGA_URL/api/pastes?$(query)")
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

fetch() { # fetch <code>
	code=$(printf %s "$1" | tr -d ' -')
	where=$(curl -sS -o /dev/null -w '%{redirect_url}' -H "$auth" "$SAGA_URL/$code") || die "can't reach $SAGA_URL"
	case $where in
		*/paste/*)
			# Delete-after-first-open items only open with a POST.
			curl -sSf -H "$auth" "$SAGA_URL/paste/$code/raw" 2>/dev/null || request -X POST "$SAGA_URL/paste/$code/raw" ;;
		*/file/*)
			# A plain GET is refused (403) for delete-after-first-open files; those need a POST.
			if [ "$(curl -sS -o /dev/null -w '%{http_code}' -I -H "$auth" "$SAGA_URL/file/$code/download")" = 403 ]; then
				download "$SAGA_URL/file/$code/download" -X POST || die "couldn't download $code"
			else
				download "$SAGA_URL/file/$code/download" || die "couldn't download $code"
			fi ;;
		*/collection/*)
			download "$SAGA_URL/collection/$code/archive" || die "couldn't download collection $code"
			[ "$quiet" = 1 ] || echo "to install it instead: curl -fsSL $SAGA_URL/collection/$code/install.sh | sh" >&2 ;;
		*) die "no item with code $code" ;;
	esac
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

if [ $# -eq 0 ] || [ "$1" = - ]; then
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
