Browsers block JSON loading from file://, open powershell and launch it from <wherever you saved the files to> with:
py -m http.server 8000 --directory C:\Users\you\wherever\you\downloaded\it
Then open:
http://localhost:8000/fantasy_vorp_draft_board_2026_v8.html
in your web browser