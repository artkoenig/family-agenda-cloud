#!/bin/sh
# Prints the newest code Mailpit holds for $1, with the mail's subject.
curl -s "http://localhost:8225/api/v1/search?query=to:$1&limit=1" | python3 -c 'import json,sys,re; m=json.load(sys.stdin)["messages"][0]; print(re.search(r"\b\d{6}\b", m["Snippet"]).group(0), "|", m["Subject"])'
