#!/bin/sh
# sagacp: share files and text through Saga, and fetch them by code.
# Server: __SAGA_URL__ (override with SAGA_URL)
#
#   sagacp photo.jpg notes.txt     share files (prints links, copies the last one)
#   sagacp ./configs/              share a folder as .tar.gz
#   journalctl -n 200 | sagacp     share text from a pipe
#   sagacp 12345678                fetch: files and collections are saved here, text goes to stdout
#   sagacp --install 12345678      install a collection's files (--dry-run to preview, --root for /etc)
#   sagacp -p ~/.ssh/id_ed25519    encrypt with a password first; fetching asks for it (or set SAGA_PASS)
#   sagacp --save 12345678         copy an item or collection to Saga's NAS folder
#   sagacp --info 12345678         what a code is (size, expiry…) without fetching or opening it
#
# Options: -e/--expire 10m|1h|1d|7d|30d|never  -1/--once  -k/--keep  -n/--name NAME  -p/--encrypt
#          -q/--quiet (links and paths only)  -v/--verbose (details, HTTP status, timings)  --no-copy
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

expiry='' burn='' name='' quiet=0 verbose=0 copy=1 install='' dry=0 root=0 encrypt=0 save='' info_code=''

usage() {
	sed -n '2,16s/^# \{0,1\}//p' "$0" 2>/dev/null || echo "usage: sagacp [options] [file|dir|code ...]"
}
die() { echo "sagacp: $*" >&2; exit 1; }
# Progress and results go to stderr, so stdout stays just the text or the links.
say() { [ "$quiet" = 1 ] || echo "$*" >&2; }
detail() { printf '  %-9s %s\n' "$1" "$2" >&2; }

while [ $# -gt 0 ]; do
	case $1 in
		-e | --expire) [ $# -ge 2 ] || die "$1 needs a value"; expiry=$2; shift 2 ;;
		-1 | --once) burn=1; shift ;;
		-k | --keep) burn=0; shift ;;
		-n | --name) [ $# -ge 2 ] || die "$1 needs a value"; name=$2; shift 2 ;;
		-p | --encrypt) encrypt=1; shift ;;
		-q | --quiet) quiet=1; shift ;;
		-v | --verbose) verbose=1; shift ;;
		--info) [ $# -ge 2 ] || die "$1 needs a code"; info_code=$2; shift 2 ;;
		--no-copy) copy=0; shift ;;
		-i | --install) [ $# -ge 2 ] || die "$1 needs a collection code"; install=$2; shift 2 ;;
		--save) [ $# -ge 2 ] || die "$1 needs a code"; save=$2; shift 2 ;;
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
	[ "$encrypt" = 1 ] && q="${q}&encrypted=1"
	printf %s "${q#&}"
}

# Runs curl, prints the body on success, or the server's message on failure.
request() {
	out=$(curl -sS -w '\n%{http_code} %{size_upload} %{time_total}' -H "$auth" -H 'Accept: text/plain' "$@") || die "can't reach $SAGA_URL"
	stats=$(printf %s "$out" | tail -n 1)
	status=${stats%% *}
	body=$(printf %s "$out" | sed '$d')
	# shellcheck disable=SC2086
	[ "$verbose" = 1 ] && set -- $stats && [ "$2" != 0 ] && detail HTTP "$1, sent $(human "$2") in $(secs "$3")"
	case $status in
		2??) printf '%s\n' "$body" ;;
		401) die "API key not accepted: check $config (or SAGA_TOKEN), or make a new one in Settings" ;;
		*)
			msg=$(printf %s "$body" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')
			# Pages that aren't API routes answer with HTML; their <title> is the message.
			[ -n "$msg" ] || msg=$(printf %s "$body" | sed -n 's/.*<title>\(.*\)<\/title>.*/\1/p' | head -n 1)
			die "${msg:-${body:-HTTP $status}}" ;;
	esac
}

# Reads one field from Saga's JSON: strings with jstr, numbers, true/false and null with jval.
jstr() { printf %s "$2" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -n 1; }
jval() { printf %s "$2" | sed -n "s/.*\"$1\":\([0-9a-z.]*\).*/\1/p" | head -n 1; }

# 1536 → 1.5 KB
human() { awk -v b="${1:-0}" 'BEGIN { split("B KB MB GB TB", u, " "); i = 1; while (b >= 1024 && i < 5) { b /= 1024; i++ } printf(i == 1 ? "%d %s" : "%.1f %s", b, u[i]) }'; }

# 0.0147 → 15 ms, 2.31 → 2.3 s
secs() { awk -v t="$1" 'BEGIN { if (t < 1) printf("%d ms", t * 1000 + 0.5); else printf("%.1f s", t) }'; }

# A time in ms since 1970 → "in 3h" or "2d ago".
when() {
	awk -v t="$1" -v now="$(date +%s)" 'BEGIN { d = int(t / 1000) - now; s = d < 0 ? -d : d
		v = s < 60 ? s "s" : s < 3600 ? int(s / 60) "m" : s < 86400 ? int(s / 3600) "h" : int(s / 86400) "d"
		print (d < 0 ? v " ago" : "in " v) }'
}

# One line about a code, from resolve: "file, 1.2 MB, expires in 3h, encrypted".
describe() {
	case $(jstr kind "$1") in
		collection)
			n=$(jval count "$1")
			printf 'collection, %s %s, %s' "$n" "$([ "$n" = 1 ] && echo file || echo files)" "$(human "$(jval size "$1")")" ;;
		*)
			exp=$(jval expiresAt "$1")
			printf '%s, %s, %s' "$([ "$(jstr kind "$1")" = paste ] && echo text || echo file)" "$(human "$(jval size "$1")")" \
				"$([ "$exp" = null ] && echo 'never expires' || echo "expires $(when "$exp")")"
			[ "$(jval encrypted "$1")" = true ] && printf ', encrypted'
			[ "$(jval burn "$1")" = true ] && printf ', deleted once opened'
			;;
	esac
}

# The rest, for -v and --info.
details() { # details <resolve json> <code>
	detail code "$(printf %s "$2" | cut -c1-4) $(printf %s "$2" | cut -c5-)"
	if [ "$(jstr kind "$1")" = collection ]; then
		detail updated "$(when "$(jval updatedAt "$1")")"
		detail link "$SAGA_URL/collection/$2"
	else
		detail type "$(jstr mime "$1")"
		detail size "$(jval size "$1") bytes"
		detail shared "$(when "$(jval createdAt "$1")")"
		detail views "$(jval views "$1")"
		detail link "$SAGA_URL/$(jstr kind "$1")/$2"
	fi
}

# curl for fetching into a file: a progress bar for big downloads on a terminal, and with -v the
# HTTP status, size, time and speed.
get() { # get <file> [curl options...] <url>
	file=$1; shift
	w='%{http_code} %{size_download} %{time_total} %{speed_download}'
	if [ "${bar:-0}" = 1 ]; then s=$(curl -#Sf -w "$w" -o "$file" "$@") || return 1
	else s=$(curl -sSf -w "$w" -o "$file" "$@") || return 1; fi
	# shellcheck disable=SC2086
	[ "$verbose" = 1 ] && set -- $s && detail HTTP "$1, $(human "$2") in $(secs "$3") ($(human "${4%.*}")/s)"
	return 0
}

# Encryption is openssl's own format (the same as Saga's web app), so plain `openssl enc -d` works too.
CIPHER='-aes-256-cbc -pbkdf2 -iter 600000 -md sha256'

need_openssl() {
	command -v openssl >/dev/null 2>&1 || die "openssl is required for encrypted items"
	# shellcheck disable=SC2086
	printf x | openssl enc $CIPHER -pass pass:x >/dev/null 2>&1 || die "this openssl can't do -pbkdf2: it needs OpenSSL 1.1.1 or later (macOS: brew install openssl)"
}

# Puts the password in SAGA_PASS (exported for openssl's -pass env:), asking on the terminal unless it's set.
ask_password() { # ask_password <prompt> [confirm]
	need_openssl
	if [ -z "${SAGA_PASS:-}" ]; then
		(: </dev/tty) 2>/dev/null || die "no terminal to ask for the password; set SAGA_PASS"
		trap 'stty echo </dev/tty 2>/dev/null || true' EXIT INT TERM
		stty -echo </dev/tty 2>/dev/null || true
		printf '%s: ' "$1" >/dev/tty
		IFS= read -r SAGA_PASS </dev/tty || true
		printf '\n' >/dev/tty
		if [ -n "${2:-}" ]; then
			printf 'Again: ' >/dev/tty
			IFS= read -r again </dev/tty || true
			printf '\n' >/dev/tty
			[ "$again" = "$SAGA_PASS" ] || die "the passwords don't match"
		fi
		stty echo </dev/tty 2>/dev/null || true
	fi
	[ -n "$SAGA_PASS" ] || die "no password"
	[ -z "${2:-}" ] || [ ${#SAGA_PASS} -ge 8 ] || die "use a password of at least 8 characters"
	export SAGA_PASS
}

# shellcheck disable=SC2086
seal() { openssl enc $CIPHER -salt -pass env:SAGA_PASS "$@"; }
# shellcheck disable=SC2086
unseal() { openssl enc -d $CIPHER -pass env:SAGA_PASS "$@" 2>/dev/null; }

last=''
shared() { # shared <label> <url>
	last=$2
	if [ "$quiet" = 1 ]; then echo "$2"; return; fi
	code=${2##*/}
	printf '%s  %s  (code %s %s)%s\n' "$1" "$2" "$(printf %s "$code" | cut -c1-4)" "$(printf %s "$code" | cut -c5-)" "$([ "$encrypt" = 1 ] && echo ', encrypted')"
}

mimetype() { file -b --mime-type "$1" 2>/dev/null || echo application/octet-stream; }

share_file() {
	f=$1
	n=${name:-$(basename "$f")}
	if [ "$encrypt" = 1 ]; then
		url=$(seal -in "$f" | request -T - -H "Content-Type: $(mimetype "$f")" "$API/files/$(urlencode "$n")?$(query)")
	else
		url=$(request -T "$f" -H "Content-Type: $(mimetype "$f")" "$API/files/$(urlencode "$n")?$(query)")
	fi
	shared "$n" "$url"
}

share_dir() {
	d=${1%/}
	n=${name:-$(basename "$d").tar.gz}
	command -v tar >/dev/null 2>&1 || die "tar is required to share a folder"
	if [ "$encrypt" = 1 ]; then
		url=$(tar -czf - -C "$(dirname "$d")" "$(basename "$d")" | seal | request -T - -H 'Content-Type: application/gzip' "$API/files/$(urlencode "$n")?$(query)")
	else
		url=$(tar -czf - -C "$(dirname "$d")" "$(basename "$d")" | request -T - -H 'Content-Type: application/gzip' "$API/files/$(urlencode "$n")?$(query)")
	fi
	shared "$n" "$url"
}

share_stdin() {
	if [ "$encrypt" = 1 ]; then
		url=$(seal -a -A | request --data-binary @- -H 'Content-Type: text/plain' "$API/pastes?$(query)")
	else
		url=$(request --data-binary @- -H 'Content-Type: text/plain' "$API/pastes?$(query)")
	fi
	shared "${name:-text}" "$url"
}

# A name that isn't taken here: name, name.1, name.2…
unique() { t=$1 i=1; while [ -e "$t" ]; do t="$1.$i"; i=$((i + 1)); done; printf %s "$t"; }

# Downloads to a temp file first, then names it from the server's Content-Disposition,
# never overwriting: a delete-after-first-open item is gone once fetched, so it must land somewhere.
# With enc=1 it's decrypted; on a wrong password the encrypted copy is kept instead.
download() { # download <url> [curl options...]
	url=$1; shift
	tmp=$(mktemp ./.sagacp.XXXXXX) hdr=$(mktemp)
	if ! get "$tmp" -D "$hdr" -H "$auth" "$@" "$url"; then rm -f "$tmp" "$hdr"; return 1; fi
	n=$(sed -n 's/.*filename="\([^"]*\)".*/\1/p' "$hdr" | tr -d '\r' | head -n 1)
	rm -f "$hdr"
	n=$(basename "${n:-download}")
	if [ "${enc:-0}" = 1 ]; then
		plain=$(mktemp ./.sagacp.XXXXXX)
		if unseal -in "$tmp" -out "$plain"; then
			rm -f "$tmp"
			tmp=$plain n=${n%.enc}
			[ "$verbose" = 1 ] && detail decrypt ok
		else
			rm -f "$plain"
			target=$(unique "$n")
			mv "$tmp" "$target"
			die "wrong password; the encrypted file is saved as $target (decrypt: openssl enc -d $CIPHER -in $target -out ${n%.enc})"
		fi
	fi
	target=$(unique "$n")
	mv "$tmp" "$target"
	if [ "$quiet" = 1 ]; then echo "$target"; else
		echo "saved $target ($(human "$(wc -c <"$target" | tr -d ' ')"))$([ "${method:-}" = POST ] && echo ', now deleted from Saga')" >&2
	fi
}

# What a code points to: paste, file or collection (and, for items, whether it burns or is encrypted).
resolve() { request "$API/resolve/$1"; }

fetch() { # fetch <code>
	code=$(printf %s "$1" | tr -d ' -')
	info=$(resolve "$code")
	label=$(jstr name "$info")
	say "fetching ${label:-$code}: $(describe "$info")"
	[ "$verbose" = 1 ] && details "$info" "$code"
	# A progress bar for anything over 1 MB, on a terminal.
	bar=0
	[ "$quiet" = 0 ] && [ -t 2 ] && [ "$(jval size "$info")" -gt 1048576 ] 2>/dev/null && bar=1
	# Delete-after-first-open items only open with a POST.
	case $info in *'"burn":true'*) method=POST ;; *) method=GET ;; esac
	case $info in *'"encrypted":true'*) enc=1; ask_password "Password for $code" ;; *) enc=0 ;; esac
	case $info in
		*'"kind":"paste"'*)
			if [ "$enc" = 1 ]; then
				tmp=$(mktemp)
				get "$tmp" -H "$auth" -X "$method" "$API/paste/$code/raw" || { rm -f "$tmp"; die "couldn't fetch $code"; }
				unseal -a -A -in "$tmp" && { rm -f "$tmp"; return; }
				target=$(unique "$code.txt.b64.enc")
				mv "$tmp" "$target"
				die "wrong password; the encrypted text is saved as $target (decrypt: openssl enc -d $CIPHER -a -A -in $target)"
			fi
			# Straight to stdout (not via request), so the text comes out byte for byte.
			# Via a temp file (pastes are small), so -v can report on it; then out byte for byte.
			tmp=$(mktemp)
			get "$tmp" -H "$auth" -X "$method" "$API/paste/$code/raw" || { rm -f "$tmp"; die "couldn't fetch $code"; }
			cat "$tmp"
			rm -f "$tmp"
			if [ "$method" = POST ]; then say "(now deleted from Saga)"; fi
			;;
		*'"kind":"file"'*)
			download "$API/file/$code/download" -X "$method" || die "couldn't download $code" ;;
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
	# Fetched as you (with your key), then run as root only if asked (sudo -E keeps SAGA_PASS, if set).
	if [ "$root" = 1 ]; then sudo -E sh "$@"; else sh "$@"; fi || { rm -f "$script"; exit 1; }
	rm -f "$script"
}

# Copies an item or collection into Saga's NAS folder (Settings > Backups).
save_to_nas() { # save_to_nas <code>
	code=$(printf %s "$1" | tr -d ' -')
	case $(resolve "$code") in
		*'"kind":"collection"'*) what=collections ;;
		*) what=items ;;
	esac
	out=$(request -X POST "$API/$what/$code/save")
	echo "saved to NAS: $(printf %s "$out" | sed -n 's/.*"path":"\([^"]*\)".*/\1/p')"
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

if [ -n "$info_code" ]; then
	code=$(printf %s "$info_code" | tr -d ' -')
	info=$(resolve "$code")
	label=$(jstr name "$info")
	echo "${label:-$code}: $(describe "$info")"
	details "$info" "$code" 2>&1
	exit 0
elif [ -n "$install" ]; then
	install_collection "$install"
	exit 0
elif [ -n "$save" ]; then
	save_to_nas "$save"
	exit 0
fi
# Sharing with -p: one password for everything shared in this run.
sharing=0
for arg in "$@"; do [ -e "$arg" ] && sharing=1; done
{ [ $# -eq 0 ] || [ "$1" = - ]; } && sharing=1
[ "$encrypt" = 1 ] && [ "$sharing" = 1 ] && ask_password "Password to encrypt with" confirm

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
