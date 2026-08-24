// clips.js
// Clean implementation: accept only YouTube URLs, render/play clip cards inline using
// the YouTube IFrame API with fallbacks. Includes debug logs to help diagnose issues.

console.log('clips.js: loaded');

function extractYouTubeId(urlOrId) {
    if (!urlOrId) return '';
    const s = urlOrId.trim();
    if (/^[A-Za-z0-9_-]{5,}$/.test(s) && !s.includes('youtube') && !s.includes('youtu.')) return s;
    const patterns = [
        /(?:v=|v\/|embed\/|youtu\.be\/)([A-Za-z0-9_-]{5,})/,
        /youtube\.com.*[?&]v=([^&]+)/
    ];
    for (const p of patterns) {
        const m = s.match(p);
        if (m && m[1]) return m[1];
    }
    return '';
}

function makeEmbedUrl(videoId) {
    const params = new URLSearchParams();
    params.set('rel', '0');
    params.set('autoplay', '1');
    params.set('modestbranding', '1');
    params.set('playsinline', '1');
    try { params.set('origin', location.origin); } catch (e) {}
    return 'https://www.youtube.com/embed/' + videoId + '?' + params.toString();
}

function loadClipsFromStorage(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}

function saveClipsToStorage(key, clips) { localStorage.setItem(key, JSON.stringify(clips)); }

function escapeHtml(text) {
    return (text || '').replace(/[&<>\"]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return m;
    });
}

function renderClipsList(storageKey, listElementId, iframeId) {
    const listEl = document.getElementById(listElementId);
    if (!listEl) return;
    const clips = loadClipsFromStorage(storageKey);
    if (!clips || clips.length === 0) {
        listEl.innerHTML = '<li class="empty">No clips yet. Add one using the form below.</li>';
        return;
    }
    listEl.innerHTML = clips.map((c, idx) => {
        const thumb = 'https://img.youtube.com/vi/' + c.videoId + '/hqdefault.jpg';
        const title = c.title || ('Clip - ' + c.videoId);
        const watchUrl = 'https://youtube.com/watch?v=' + c.videoId;
        return '\n<li class="clip-card" data-idx="' + idx + '" data-video="' + c.videoId + '">'
            + '<div class="thumb-wrap">'
            + '<img class="thumb" src="' + thumb + '" alt="' + escapeHtml(title) + '">' 
            + '<div class="play-overlay">▶</div>'
            + '</div>'
            + '<div class="card-body">'
            + '<div class="card-title">' + escapeHtml(title) + '</div>'
            + '<a class="open-youtube" href="' + watchUrl + '" target="_blank" rel="noopener">Open on YouTube</a>'
            + '</div>'
            + '</li>';
    }).join('\n');

    listEl.querySelectorAll('.clip-card').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('.open-youtube')) return;
            playClipInCard(item);
        });
    });
}

function stopAllCards() {
    // destroy any active YT players
    if (window._ytPlayers) {
        Object.keys(window._ytPlayers).forEach(pid => { try { window._ytPlayers[pid].destroy(); } catch (e) {} });
        window._ytPlayers = {};
    }
    // restore thumbnails
    document.querySelectorAll('.clip-card.playing').forEach(card => {
        const videoId = card.dataset.video;
        const thumb = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
        const title = card.querySelector('.card-title') ? card.querySelector('.card-title').textContent : '';
        const thumbWrap = card.querySelector('.thumb-wrap');
        if (thumbWrap) thumbWrap.innerHTML = '<img class="thumb" src="' + thumb + '" alt="' + escapeHtml(title) + '"><div class="play-overlay">▶</div>';
        card.classList.remove('playing');
    });
}

function playClipInCard(item) {
    if (!item) return; const videoId = item.dataset.video; if (!videoId) return;
    if (item.classList.contains('playing')) { stopAllCards(); return; }
    stopAllCards();
    const thumbWrap = item.querySelector('.thumb-wrap'); if (!thumbWrap) return;
    // Use YouTube Iframe API if possible
    ensureYouTubeApi().then(() => {
        const playerContainerId = 'yt-player-' + Date.now() + '-' + Math.floor(Math.random()*1000);
        const container = document.createElement('div'); container.id = playerContainerId; container.style.width = '100%'; container.style.height = '100%';
        thumbWrap.innerHTML = ''; thumbWrap.appendChild(container);
        try {
            const player = new YT.Player(playerContainerId, {
                height: '220', width: '100%', videoId: videoId,
                playerVars: { autoplay: 1, playsinline: 1, modestbranding: 1, rel: 0 },
                events: { onReady: function(e){ try{ e.target.playVideo(); }catch(_){} } }
            });
            window._ytPlayers = window._ytPlayers || {}; window._ytPlayers[playerContainerId] = player;
            item.classList.add('playing');
        } catch (err) {
            // fallback to iframe
            const iframe = document.createElement('iframe'); iframe.src = makeEmbedUrl(videoId);
            iframe.allow = 'autoplay; encrypted-media; clipboard-write; picture-in-picture; accelerometer; gyroscope';
            iframe.loading = 'lazy'; iframe.referrerPolicy = 'no-referrer-when-downgrade'; iframe.setAttribute('allowfullscreen','');
            thumbWrap.innerHTML = ''; thumbWrap.appendChild(iframe); item.classList.add('playing');
        }
    }).catch(() => {
        const iframe = document.createElement('iframe'); iframe.src = makeEmbedUrl(videoId);
        iframe.allow = 'autoplay; encrypted-media; clipboard-write; picture-in-picture; accelerometer; gyroscope';
        iframe.loading = 'lazy'; iframe.referrerPolicy = 'no-referrer-when-downgrade'; iframe.setAttribute('allowfullscreen','');
        thumbWrap.innerHTML = ''; thumbWrap.appendChild(iframe); item.classList.add('playing');
    });
}

function ensureYouTubeApi() {
    if (window._ytApiReady) return Promise.resolve();
    if (window._ytApiLoadingPromise) return window._ytApiLoadingPromise;
    window._ytApiLoadingPromise = new Promise((resolve, reject) => {
        const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api'; tag.async = true;
        tag.onerror = () => reject(new Error('YouTube API failed to load'));
        document.head.appendChild(tag);
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function() { window._ytApiReady = true; if (typeof prev === 'function') prev(); resolve(); };
        setTimeout(()=>{ if (!window._ytApiReady) reject(new Error('YouTube API ready timeout')); }, 8000);
    });
    return window._ytApiLoadingPromise;
}

function setupAddClipForm(formId, storageKey, listElementId, iframeId) {
    const form = document.getElementById(formId);
    if (!form) { console.warn('clips.js: form not found', formId); return; }
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const urlEl = document.getElementById(formId.replace('add-clip-form-', 'clip-url-'));
        const nameEl = document.getElementById(formId.replace('add-clip-form-', 'clip-name-'));
        if (!urlEl) { alert('URL input not found'); return; }
        const raw = urlEl.value.trim(); if (!raw) { alert('Please enter at least one YouTube URL'); return; }
        const nameVal = nameEl ? nameEl.value.trim() : '';
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const clips = loadClipsFromStorage(storageKey);
        let added = 0;
        lines.forEach(line => {
            const videoId = extractYouTubeId(line);
            if (!videoId) return; if (clips.some(c => c.videoId === videoId)) return;
            const title = nameVal || ('Clip - ' + videoId);
            clips.push({ title, videoId }); added++;
        });
        if (added === 0) { alert('No new valid YouTube URLs found to add.'); return; }
        saveClipsToStorage(storageKey, clips); renderClipsList(storageKey, listElementId, iframeId); form.reset();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('clips.js: DOMContentLoaded');
    if (document.getElementById('clips-list-songs')) { 
        console.log('init songs (merge specials first)');
        mergeSpecialsIntoSongs();
        renderClipsList('songs','clips-list-songs','clip-iframe-songs');
        setupAddClipForm('add-clip-form-songs','songs','clips-list-songs','clip-iframe-songs');
    }
    if (document.getElementById('clips-list-sermons')) { console.log('init sermons'); renderClipsList('sermons','clips-list-sermons','clip-iframe-sermons'); setupAddClipForm('add-clip-form-sermons','sermons','clips-list-sermons','clip-iframe-sermons'); }
    // specials page removed; if present, merging code above will pick up stored specials
});

// Merge any existing 'specials' clips into 'songs' storage and remove 'specials' key
function mergeSpecialsIntoSongs() {
    try {
        const specials = loadClipsFromStorage('specials');
        if (!specials || specials.length === 0) return;
        const songs = loadClipsFromStorage('songs');
        let added = 0;
        specials.forEach(s => {
            if (!s || !s.videoId) return;
            if (!songs.some(x => x.videoId === s.videoId)) {
                songs.push(s);
                added++;
            }
        });
        if (added > 0) {
            saveClipsToStorage('songs', songs);
            console.log('mergeSpecialsIntoSongs: added', added, 'clips to songs');
        }
        // remove specials key
        localStorage.removeItem('specials');
    } catch (e) { console.warn('mergeSpecialsIntoSongs error', e); }
}

