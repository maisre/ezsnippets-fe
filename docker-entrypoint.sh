#!/bin/sh
set -e

cat > /usr/share/nginx/html/config.json <<EOF
{
  "apiUrl": "${API_URL:-http://localhost:3000}",
  "viewUrl": "${VIEW_URL:-http://localhost:3100}"
}
EOF

exec "$@"
