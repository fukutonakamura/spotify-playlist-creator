import { useState, useCallback, useEffect, useRef } from "react";

/*
 * =============================================
 *  Spotify Playlist Creator — Mobile-First
 *  Auth: Authorization Code Flow with PKCE
 *  (No backend needed)
 * =============================================
 */

const SPOTIFY_CLIENT_ID = "0bd908bfd00242e880c81e6dcb34cabc";
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = "playlist-modify-public playlist-modify-private";

// ── PKCE Auth Helpers ──

function generateRandomString(length) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function startAuth() {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64urlEncode(hashed);

  sessionStorage.setItem("code_verifier", codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    redirect_uri: REDIRECT_URI,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const codeVerifier = sessionStorage.getItem("code_verifier");
  if (!codeVerifier) throw new Error("No code verifier found");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) throw new Error("Token exchange failed");
  const data = await res.json();
  sessionStorage.removeItem("code_verifier");
  return data.access_token;
}

// ── Helpers ──

function parsePlaylistText(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;
  const title = lines[0].trim();
  const songs = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const numbered = line.match(/^\d+[\.\)]\s*(.+)/);
    const content = numbered ? numbered[1] : line;
    const separators = [" / ", " - ", " — ", " – "];
    let songTitle = content, artist = "";
    for (const sep of separators) {
      const idx = content.indexOf(sep);
      if (idx > 0) {
        songTitle = content.substring(0, idx).trim();
        artist = content.substring(idx + sep.length).trim();
        break;
      }
    }
    if (songTitle) songs.push({ title: songTitle, artist });
  }
  return songs.length > 0 ? { title, songs } : null;
}

// ── Spotify API ──

async function spotifyGet(endpoint, token) {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

async function spotifyPost(endpoint, token, body) {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

async function searchTrack(title, artist, token) {
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const data = await spotifyGet(`/search?q=${q}&type=track&limit=1`, token);
  return data.tracks?.items?.[0] || null;
}

// ── Icons ──

function SpotifyLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

function PasteIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function CheckIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EditIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ExternalLink({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

// ── Sample ──

const SAMPLE_TEXT = `Sharp-Edged Tenderness
1. Bachelorette / Björk
2. Everything In Its Right Place / Radiohead
3. Obstacle 1 / Interpol
4. Windowlicker / Aphex Twin
5. Archangel / Burial
6. The Robots / Kraftwerk
7. Open Eye Signal / Jon Hopkins
8. DNA. / Kendrick Lamar
9. Naima / John Coltrane
10. Merry Christmas Mr. Lawrence / Ryuichi Sakamoto`;

// ── Prompt Section ──

const AI_PROMPT = `あなたは音楽キュレーターです。入力テキスト（会話ログ/自己紹介）から読み取れる「人間性」だけを根拠に、その人を表すプレイリストのタイトルを最初に1つ付け、その後に10曲を選んでください。曲やアーティスト名が入力に含まれていても、それ自体は根拠として使わないでください。
条件：
0) 出力はコピペできる"プレーンテキスト"のみ（コードブロック推奨）。余計な装飾・説明は一切なし
1) 1行目はプレイリストタイトルのみ
2) 2行目以降は10行のみ（1〜10の番号付き）
3) 各行は「曲名 / アーティスト名」
4) 実在が確実な曲だけ。確信がない場合は別の曲に差し替える（架空の曲名を作らない）
5) ジャンル偏りは避ける（同系統は最大4曲まで）
6) 有名曲だけで埋めない（半分は玄人寄りでもOK）`;

function PromptSection() {
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopyPrompt = () => {
    navigator.clipboard?.writeText(AI_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  return (
    <div style={{
      marginTop: 48, padding: 20,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, animation: "fadeIn 0.5s ease-out",
    }}>
      <div style={{
        fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.6)",
        marginBottom: 6,
      }}>
        リストがない？
      </div>
      <div style={{
        fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.7,
        marginBottom: 14,
      }}>
        このプロンプトを使ってるAIに入力してみて！<br />
        自己紹介やチャット履歴を一緒に貼ると、あなただけのプレイリストが生成されます。
      </div>

      <div style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10, padding: 14,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, lineHeight: 1.8,
        color: "rgba(255,255,255,0.45)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 200,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}>
        {AI_PROMPT}
      </div>

      <button
        className="btn btn-ghost"
        onClick={handleCopyPrompt}
        style={{
          width: "100%", marginTop: 12,
          fontSize: 14,
          color: promptCopied ? "#1DB954" : "rgba(255,255,255,0.5)",
          borderColor: promptCopied ? "rgba(29,185,84,0.3)" : "rgba(255,255,255,0.08)",
          transition: "all 0.2s ease",
        }}
      >
        {promptCopied
          ? <><CheckIcon size={14} /> コピーしました</>
          : <><CopyIcon /> プロンプトをコピー</>
        }
      </button>
    </div>
  );
}

// ── Main App ──

export default function App() {
  const [phase, setPhase] = useState("paste");
  const [rawText, setRawText] = useState("");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [songs, setSongs] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [progress, setProgress] = useState(0);
  const [currentTrack, setCurrentTrack] = useState("");
  const [results, setResults] = useState([]);
  const [createdPlaylistUrl, setCreatedPlaylistUrl] = useState("");
  const [error, setError] = useState("");

  // Handle PKCE callback: check for ?code= in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      setAuthLoading(true);
      window.history.replaceState(null, "", window.location.pathname);
      exchangeCodeForToken(code)
        .then((accessToken) => {
          setToken(accessToken);
          return spotifyGet("/me", accessToken);
        })
        .then((userData) => {
          setUser(userData);
          setAuthLoading(false);
        })
        .catch(() => {
          setToken(null);
          setAuthLoading(false);
        });
    }
  }, []);

  useEffect(() => {
    if (!rawText.trim()) { setPasteSuccess(false); return; }
    const parsed = parsePlaylistText(rawText);
    setPasteSuccess(!!(parsed && parsed.songs.length > 0));
  }, [rawText]);

  const handleParse = useCallback(() => {
    const parsed = parsePlaylistText(rawText);
    if (parsed) {
      setPlaylistTitle(parsed.title);
      setSongs(parsed.songs);
      setPhase("preview");
    }
  }, [rawText]);

  useEffect(() => {
    if (pasteSuccess) {
      const timer = setTimeout(() => handleParse(), 900);
      return () => clearTimeout(timer);
    }
  }, [pasteSuccess, handleParse]);

  const handleSongEdit = (i, field, value) => {
    const u = [...songs]; u[i] = { ...u[i], [field]: value }; setSongs(u);
  };
  const removeSong = (i) => setSongs(songs.filter((_, idx) => idx !== i));
  const handleReset = () => {
    setPhase("paste"); setRawText(""); setPlaylistTitle(""); setSongs([]);
    setPasteSuccess(false); setEditingIndex(null); setProgress(0);
    setCurrentTrack(""); setResults([]); setCreatedPlaylistUrl(""); setError("");
    setCopied(false);
  };
  const handleLogin = () => startAuth();
  const handleLogout = () => { setToken(null); setUser(null); };
  const handleCopyList = () => {
    const text = `${playlistTitle}\n${songs.map((s, i) => `${i + 1}. ${s.title} / ${s.artist}`).join("\n")}`;
    navigator.clipboard?.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async () => {
    if (!token || !user) return;
    setPhase("creating"); setError(""); setResults([]);
    try {
      const searchResults = [];
      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        setCurrentTrack(`${song.title} — ${song.artist}`);
        setProgress(((i + 0.5) / (songs.length + 1)) * 100);
        try {
          const track = await searchTrack(song.title, song.artist, token);
          searchResults.push({ song, spotifyTrack: track, found: !!track });
        } catch { searchResults.push({ song, spotifyTrack: null, found: false }); }
        setResults([...searchResults]);
        await new Promise((r) => setTimeout(r, 200));
      }
      setCurrentTrack("プレイリストを作成中..."); setProgress(90);
      const trackUris = searchResults.filter((r) => r.found).map((r) => r.spotifyTrack.uri);
      if (trackUris.length === 0) {
        setError("曲が見つかりませんでした。曲名を確認してください。");
        setPhase("preview"); return;
      }
      const playlist = await spotifyPost(`/users/${user.id}/playlists`, token, {
        name: playlistTitle || "My Playlist",
        description: "Created with Playlist Creator",
        public: false,
      });
      setCurrentTrack("曲を追加中..."); setProgress(95);
      await spotifyPost(`/playlists/${playlist.id}/tracks`, token, { uris: trackUris });
      setCreatedPlaylistUrl(playlist.external_urls.spotify);
      setProgress(100); setPhase("done");
    } catch (err) {
      setError(`エラー: ${err.message}`); setPhase("preview");
    }
  };

  const handleDemoCreate = async () => {
    setPhase("creating");
    const demoResults = [];
    for (let i = 0; i < songs.length; i++) {
      setCurrentTrack(`${songs[i].title} — ${songs[i].artist}`);
      setProgress(((i + 1) / (songs.length + 1)) * 100);
      demoResults.push({
        song: songs[i],
        spotifyTrack: {
          name: songs[i].title, artists: [{ name: songs[i].artist }],
          album: { name: "Album", images: [{ url: "" }] },
          external_urls: { spotify: `https://open.spotify.com/search/${encodeURIComponent(songs[i].title + " " + songs[i].artist)}` },
        }, found: true,
      });
      setResults([...demoResults]);
      await new Promise((r) => setTimeout(r, 350));
    }
    setCurrentTrack("プレイリスト作成中..."); setProgress(95);
    await new Promise((r) => setTimeout(r, 600));
    setProgress(100); setPhase("done");
  };

  const isDemo = !token;
  const foundCount = results.filter((r) => r.found).length;

  return (
    <div style={{
      minHeight: "100vh",
      minHeight: "100dvh",
      background: "#0a0a0a", color: "#eee",
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      WebkitTextSizeAdjust: "100%",
      overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-text-size-adjust: 100%; }
        body { background: #0a0a0a; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
        input, textarea, select { font-size: 16px !important; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bounceCheck {
          0% { transform: scale(0); } 60% { transform: scale(1.15); } 100% { transform: scale(1); }
        }
        @keyframes slideRow {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes successBorder {
          0% { border-color: rgba(29,185,84,0.5); }
          50% { border-color: rgba(29,185,84,0.15); }
          100% { border-color: rgba(29,185,84,0.5); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }

        .paste-area {
          width: 100%; min-height: 220px;
          background: rgba(255,255,255,0.03);
          border: 2px dashed rgba(255,255,255,0.1);
          border-radius: 14px; padding: 16px;
          color: #eee; font-family: 'JetBrains Mono', monospace;
          font-size: 16px !important; line-height: 1.75;
          resize: none; outline: none;
          transition: all 0.3s ease;
          -webkit-appearance: none; appearance: none;
        }
        .paste-area:focus { border-color: rgba(29,185,84,0.4); background: rgba(29,185,84,0.02); }
        .paste-area.success {
          border-style: solid; border-color: rgba(29,185,84,0.5);
          background: rgba(29,185,84,0.03); animation: successBorder 2s ease infinite;
        }
        .paste-area::placeholder {
          color: rgba(255,255,255,0.2); font-family: 'DM Sans', sans-serif;
          font-size: 16px !important; line-height: 2;
        }

        .track-row {
          animation: slideRow 0.3s ease-out both;
          display: flex; align-items: center; gap: 10px;
          padding: 12px; border-radius: 12px;
          transition: background 0.15s;
          -webkit-user-select: none; user-select: none;
        }
        @media (hover: hover) { .track-row:hover { background: rgba(255,255,255,0.03); } }
        .track-row:active { background: rgba(255,255,255,0.04); }

        .edit-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; padding: 10px 12px; color: #eee;
          font-size: 16px !important; font-family: 'DM Sans', sans-serif;
          outline: none; width: 100%; transition: border-color 0.2s;
          -webkit-appearance: none; appearance: none;
        }
        .edit-input:focus { border-color: #1DB954; }

        .btn {
          border: none; border-radius: 100px;
          padding: 16px 28px; font-size: 16px; font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: all 0.2s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          min-height: 48px;
          -webkit-tap-highlight-color: transparent; touch-action: manipulation;
        }
        .btn:active { transform: scale(0.97); }

        .btn-spotify { background: #1DB954; color: #000; }
        @media (hover: hover) {
          .btn-spotify:hover { background: #1ed760; box-shadow: 0 6px 24px rgba(29,185,84,0.3); transform: translateY(-1px); }
        }
        .btn-spotify:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }

        .btn-ghost {
          background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 100px;
        }
        .btn-ghost:active { background: rgba(255,255,255,0.12); }
        @media (hover: hover) { .btn-ghost:hover { background: rgba(255,255,255,0.1); color: #eee; } }

        .btn-sm { padding: 10px 16px; font-size: 13px; min-height: 40px; }

        .icon-btn {
          background: none; border: none;
          min-width: 44px; min-height: 44px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; cursor: pointer;
          color: rgba(255,255,255,0.3); transition: all 0.15s;
          -webkit-tap-highlight-color: transparent; touch-action: manipulation;
        }
        .icon-btn:active { background: rgba(255,255,255,0.1); }
        @media (hover: hover) {
          .icon-btn:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); }
          .icon-btn.danger:hover { color: #e74c3c; }
        }

        .progress-bg { height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
        .progress-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, #1DB954, #1ed760, #1DB954);
          background-size: 200% 100%; animation: gradientShift 2s ease infinite;
          transition: width 0.4s ease;
        }

        .result-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          animation: slideRow 0.3s ease-out both;
        }

        .done-song-link {
          display: flex; align-items: center; gap: 12px;
          padding: 12px; border-radius: 12px;
          text-decoration: none; color: #eee;
          transition: background 0.15s;
          animation: slideRow 0.3s ease-out both;
          -webkit-tap-highlight-color: transparent;
        }
        .done-song-link:active { background: rgba(29,185,84,0.08); }
        @media (hover: hover) { .done-song-link:hover { background: rgba(29,185,84,0.06); } }

        .spinner {
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.2);
          border-top-color: #1DB954;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @media (max-width: 480px) { .desktop-only { display: none !important; } }
        @media (min-width: 481px) { .mobile-only { display: none !important; } }
      `}</style>

      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 400,
        background: "radial-gradient(ellipse 70% 50% at 50% -8%, rgba(29,185,84,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        maxWidth: 520, margin: "0 auto",
        padding: "max(env(safe-area-inset-top, 16px), 16px) 16px max(env(safe-area-inset-bottom, 24px), 24px)",
        paddingTop: 28, position: "relative", width: "100%",
      }}>

        {/* ── Top bar ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 28, animation: "fadeIn 0.4s ease-out", gap: 8,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(29,185,84,0.1)", border: "1px solid rgba(29,185,84,0.15)",
            borderRadius: 100, padding: "7px 14px", flexShrink: 0,
          }}>
            <SpotifyLogo size={16} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1DB954", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
              Playlist Creator
            </span>
          </div>

          {authLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="spinner" />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>認証中...</span>
            </div>
          ) : token && user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{
                fontSize: 12, color: "rgba(255,255,255,0.4)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {user.display_name}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ padding: "8px 12px", flexShrink: 0 }}>
                ログアウト
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={handleLogin}>
              <SpotifyLogo size={14} /> ログイン
            </button>
          )}
        </div>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 28, animation: "fadeIn 0.5s ease-out", padding: "0 4px" }}>
          <h1 style={{ fontSize: "clamp(24px, 7vw, 30px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.3, marginBottom: 8 }}>
            {phase === "paste" && "リストを貼るだけ。"}
            {phase === "preview" && playlistTitle}
            {phase === "creating" && "作成中..."}
            {phase === "done" && "完成！"}
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            {phase === "paste" && "テキストをペーストすると自動認識"}
            {phase === "preview" && `${songs.length}曲 — 確認してSpotifyに作成`}
            {phase === "creating" && "Spotifyで曲を検索中"}
            {phase === "done" && (isDemo
              ? "デモ完了 — ログインで実際に作成"
              : `${foundCount}/${results.length}曲を追加`)}
          </p>
        </div>

        {/* ═══════ PASTE ═══════ */}
        {phase === "paste" && (
          <div style={{ animation: "fadeIn 0.5s ease-out 0.1s both" }}>
            <textarea
              className={`paste-area ${pasteSuccess ? "success" : ""}`}
              placeholder={"プレイリスト名\n1. 曲名 / アーティスト\n2. 曲名 / アーティスト\n..."}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            {pasteSuccess && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginTop: 12, color: "#1DB954", fontSize: 14, fontWeight: 500,
                animation: "fadeIn 0.3s ease-out",
              }}>
                <CheckIcon size={16} /> 認識完了 — 次へ進みます...
              </div>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setRawText(SAMPLE_TEXT)}>
                <PasteIcon size={13} /> サンプルで試す
              </button>
              {rawText.trim() && !pasteSuccess && (
                <button className="btn btn-ghost btn-sm" onClick={handleParse}>手動で読み込む →</button>
              )}
            </div>
            <div style={{
              marginTop: 24, padding: 14,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 12, fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.9,
            }}>
              <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>フォーマット</div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>1行目</span> → プレイリスト名<br />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>2行目〜</span> →{" "}
              <code style={{ background: "rgba(29,185,84,0.12)", color: "#1DB954", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                番号. 曲名 / アーティスト
              </code>
            </div>
          </div>
        )}

        {/* ═══════ PREVIEW ═══════ */}
        {phase === "preview" && (
          <div style={{ animation: "scaleIn 0.4s ease-out" }}>
            {error && (
              <div style={{
                padding: 14, marginBottom: 16, borderRadius: 12,
                background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.2)",
                color: "#e74c3c", fontSize: 14,
              }}>{error}</div>
            )}
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, overflow: "hidden",
            }}>
              <div style={{ height: 4, background: "linear-gradient(90deg, #1DB954, #1ed760, #15a047)" }} />
              <div style={{ padding: "4px" }}>
                {songs.map((song, i) => (
                  <div key={i} className="track-row" style={{ animationDelay: `${i * 0.03}s` }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: "rgba(255,255,255,0.2)", width: 20, textAlign: "right", flexShrink: 0,
                    }}>{String(i + 1).padStart(2, "0")}</span>

                    {editingIndex === i ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        <input className="edit-input" value={song.title} placeholder="曲名"
                          onChange={(e) => handleSongEdit(i, "title", e.target.value)} autoFocus />
                        <input className="edit-input" value={song.artist} placeholder="アーティスト"
                          onChange={(e) => handleSongEdit(i, "artist", e.target.value)} />
                        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-end" }}
                          onClick={() => setEditingIndex(null)}>
                          <CheckIcon size={14} /> 完了
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }} onClick={() => setEditingIndex(i)}>
                          <div style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {song.title}
                          </div>
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {song.artist}
                          </div>
                        </div>
                        <button className="icon-btn desktop-only" onClick={() => setEditingIndex(i)}><EditIcon /></button>
                        <button className="icon-btn danger" onClick={() => removeSong(i)}><XIcon /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {!token && (
              <div style={{
                marginTop: 16, padding: 14,
                background: "rgba(29,185,84,0.05)", border: "1px solid rgba(29,185,84,0.12)",
                borderRadius: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <SpotifyLogo size={20} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>ログインで自動作成</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>なしでもデモで動作確認OK</div>
                  </div>
                </div>
                <button className="btn btn-spotify" style={{ width: "100%" }} onClick={handleLogin}>Spotifyにログイン</button>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleReset}>やり直す</button>
              <button className="btn btn-spotify" style={{ flex: 2 }}
                onClick={token ? handleCreate : handleDemoCreate}
                disabled={songs.length === 0}>
                <SpotifyLogo size={18} />
                {token ? "プレイリスト作成" : "デモで作成"}
              </button>
            </div>
          </div>
        )}

        {/* ═══════ CREATING ═══════ */}
        {phase === "creating" && (
          <div style={{ animation: "fadeIn 0.4s ease-out" }}>
            <div style={{ marginBottom: 24 }}>
              <div className="progress-bg">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{
                marginTop: 14, fontSize: 14, color: "rgba(255,255,255,0.45)",
                display: "flex", alignItems: "center", gap: 6, overflow: "hidden",
              }}>
                <span style={{ animation: "pulse 1.2s ease infinite", color: "#1DB954", flexShrink: 0 }}>♪</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack}</span>
              </div>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, padding: "6px 4px",
            }}>
              {results.map((r, i) => (
                <div key={i} className="result-row" style={{ animationDelay: `${i * 0.04}s` }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    color: "rgba(255,255,255,0.2)", width: 20, textAlign: "right", flexShrink: 0,
                  }}>{String(i + 1).padStart(2, "0")}</span>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: r.found ? "#1DB954" : "rgba(231,76,60,0.6)",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: r.found ? "#eee" : "rgba(255,255,255,0.35)",
                    }}>{r.found ? (r.spotifyTrack?.name || r.song.title) : r.song.title}</div>
                    <div style={{
                      fontSize: 12, color: "rgba(255,255,255,0.3)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{r.found ? (r.spotifyTrack?.artists?.[0]?.name || r.song.artist) : `${r.song.artist} — 見つかりません`}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════ DONE ═══════ */}
        {phase === "done" && (
          <div style={{ animation: "scaleIn 0.4s ease-out" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 56, height: 56, borderRadius: "50%",
                background: "#1DB954", boxShadow: "0 6px 24px rgba(29,185,84,0.3)",
                animation: "bounceCheck 0.5s ease-out",
              }}><CheckIcon size={26} /></div>
            </div>

            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, overflow: "hidden",
            }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{playlistTitle}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  {foundCount}/{results.length}曲{isDemo ? "（デモ）" : ""}
                </div>
              </div>
              <div style={{ padding: "4px" }}>
                {results.map((r, i) => (
                  <a key={i} className="done-song-link"
                    href={r.found ? (r.spotifyTrack?.external_urls?.spotify || "#") : "#"}
                    target="_blank" rel="noopener noreferrer"
                    style={{ animationDelay: `${i * 0.04}s`, opacity: r.found ? 1 : 0.35 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: r.found && r.spotifyTrack?.album?.images?.[0]?.url
                        ? `url(${r.spotifyTrack.album.images[0].url}) center/cover`
                        : "rgba(29,185,84,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {(!r.found || !r.spotifyTrack?.album?.images?.[0]?.url) && (
                        <span style={{ fontSize: 14 }}>{r.found ? "♪" : "✕"}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.found ? (r.spotifyTrack?.name || r.song.title) : r.song.title}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                        {r.found ? (r.spotifyTrack?.artists?.[0]?.name || r.song.artist) : "見つかりません"}
                      </div>
                    </div>
                    {r.found && <span style={{ fontSize: 11, color: "#1DB954", flexShrink: 0 }}><ExternalLink size={14} /></span>}
                  </a>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              {createdPlaylistUrl ? (
                <a href={createdPlaylistUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <button className="btn btn-spotify" style={{ width: "100%" }}>
                    <SpotifyLogo size={18} /> Spotifyで開く <ExternalLink />
                  </button>
                </a>
              ) : (
                <button className="btn btn-spotify" style={{ width: "100%" }} onClick={handleLogin}>
                  <SpotifyLogo size={18} /> ログインして実際に作成
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleReset}>別のリスト</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleCopyList}>
                {copied ? <><CheckIcon size={14} /> コピー済み</> : <><CopyIcon /> リストをコピー</>}
              </button>
            </div>

            {isDemo && (
              <div style={{
                marginTop: 16, padding: 14,
                background: "rgba(29,185,84,0.04)", border: "1px solid rgba(29,185,84,0.1)",
                borderRadius: 12, fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.7,
              }}>
                <strong style={{ color: "rgba(255,255,255,0.55)" }}>デモモード</strong> —
                Spotifyにログインすると実際にプレイリストが作成されます。完全無料。
              </div>
            )}
          </div>
        )}

        {/* ═══════ PROMPT SECTION ═══════ */}
        <PromptSection />

        <div style={{
          marginTop: 24, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.12)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>
          Spotify は Spotify AB の商標です
        </div>
      </div>
    </div>
  );
}