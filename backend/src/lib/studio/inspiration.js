/**
 * Daily inspiration for the studio: one famous movie line + a still from the same film.
 * The line rotates by Israel date (everyone sees the same one that day). Stills and film details
 * come from TMDB (https://www.themoviedb.org) — "This product uses the TMDB API but is not endorsed
 * or certified by TMDB." Without TMDB_API_KEY the line still shows, just without the frame.
 */
const { cached } = require('../monday');
const W = require('../creative/week');
const { getSecret } = require('./secrets');

// [line, film title, year] — short, well-known lines
const LINES = [
  ['Here’s looking at you, kid.', 'Casablanca', 1942],
  ['May the Force be with you.', 'Star Wars', 1977],
  ['You’re gonna need a bigger boat.', 'Jaws', 1975],
  ['Houston, we have a problem.', 'Apollo 13', 1995],
  ['Toto, I’ve a feeling we’re not in Kansas anymore.', 'The Wizard of Oz', 1939],
  ['Just keep swimming.', 'Finding Nemo', 2003],
  ['To infinity and beyond!', 'Toy Story', 1995],
  ['Life is like a box of chocolates. You never know what you’re gonna get.', 'Forrest Gump', 1994],
  ['Why so serious?', 'The Dark Knight', 2008],
  ['I’m the king of the world!', 'Titanic', 1997],
  ['Roads? Where we’re going, we don’t need roads.', 'Back to the Future', 1985],
  ['Carpe diem. Seize the day, boys.', 'Dead Poets Society', 1989],
  ['Hope is a good thing, maybe the best of things.', 'The Shawshank Redemption', 1994],
  ['With great power comes great responsibility.', 'Spider-Man', 2002],
  ['Why do we fall? So we can learn to pick ourselves up.', 'Batman Begins', 2005],
  ['If you build it, he will come.', 'Field of Dreams', 1989],
  ['Nobody puts Baby in a corner.', 'Dirty Dancing', 1987],
  ['I’m gonna make him an offer he can’t refuse.', 'The Godfather', 1972],
  ['Keep your friends close, but your enemies closer.', 'The Godfather Part II', 1974],
  ['You can’t handle the truth!', 'A Few Good Men', 1992],
  ['Show me the money!', 'Jerry Maguire', 1996],
  ['There is no spoon.', 'The Matrix', 1999],
  ['What we do in life echoes in eternity.', 'Gladiator', 2000],
  ['Wax on, wax off.', 'The Karate Kid', 1984],
  ['After all, tomorrow is another day!', 'Gone with the Wind', 1939],
  ['Fasten your seatbelts. It’s going to be a bumpy night.', 'All About Eve', 1950],
  ['The stuff that dreams are made of.', 'The Maltese Falcon', 1941],
  ['You talkin’ to me?', 'Taxi Driver', 1976],
  ['I see dead people.', 'The Sixth Sense', 1999],
  ['Hasta la vista, baby.', 'Terminator 2: Judgment Day', 1991],
  ['I’ll be back.', 'The Terminator', 1984],
  ['Bond. James Bond.', 'Dr. No', 1962],
  ['I feel the need — the need for speed!', 'Top Gun', 1986],
  ['E.T. phone home.', 'E.T. the Extra-Terrestrial', 1982],
  ['Gentlemen, you can’t fight in here! This is the War Room!', 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb', 1964],
  ['Here’s Johnny!', 'The Shining', 1980],
  ['They may take our lives, but they’ll never take our freedom!', 'Braveheart', 1995],
  ['Do. Or do not. There is no try.', 'The Empire Strikes Back', 1980],
  ['I am Groot.', 'Guardians of the Galaxy', 2014],
  ['Ohana means family. Family means nobody gets left behind.', 'Lilo & Stitch', 2002],
  ['Adventure is out there!', 'Up', 2009],
  ['The greatest trick the devil ever pulled was convincing the world he didn’t exist.', 'The Usual Suspects', 1995],
  ['It’s alive! It’s alive!', 'Frankenstein', 1931],
  ['Rosebud.', 'Citizen Kane', 1941],
  ['Snap out of it!', 'Moonstruck', 1987],
  ['Every passing minute is another chance to turn it all around.', 'Vanilla Sky', 2001],
  ['Inconceivable!', 'The Princess Bride', 1987],
  ['I’m walking here! I’m walking here!', 'Midnight Cowboy', 1969],
  ['You shall not pass!', 'The Lord of the Rings: The Fellowship of the Ring', 2001],
  ['My precious.', 'The Lord of the Rings: The Two Towers', 2002],
  ['I’m just a girl, standing in front of a boy, asking him to love her.', 'Notting Hill', 1999],
  ['Mrs. Robinson, you’re trying to seduce me.', 'The Graduate', 1967],
  ['Open the pod bay doors, HAL.', '2001: A Space Odyssey', 1968],
  ['Go ahead, make my day.', 'Sudden Impact', 1983],
  ['Nobody’s perfect.', 'Some Like It Hot', 1959],
  ['The first rule of Fight Club is: you do not talk about Fight Club.', 'Fight Club', 1999],
  ['Remember who you are.', 'The Lion King', 1994],
  ['Some people are worth melting for.', 'Frozen', 2013],
  ['It’s a trap!', 'Return of the Jedi', 1983],
  ['A martini. Shaken, not stirred.', 'Goldfinger', 1964],
  ['Keep the change, ya filthy animal.', 'Home Alone', 1990],
  ['Wakanda forever!', 'Black Panther', 2018],
  ['I am inevitable.', 'Avengers: Endgame', 2019],
  ['Life, uh, finds a way.', 'Jurassic Park', 1993],
  ['Mischief managed.', 'Harry Potter and the Prisoner of Azkaban', 2004],
  ['It does not do to dwell on dreams and forget to live.', 'Harry Potter and the Philosopher’s Stone', 2001],
  ['I’m not bad. I’m just drawn that way.', 'Who Framed Roger Rabbit', 1988],
  ['The Dude abides.', 'The Big Lebowski', 1998],
  ['There’s no crying in baseball!', 'A League of Their Own', 1992],
  ['You is kind. You is smart. You is important.', 'The Help', 2011],
  ['Dreams feel real while we’re in them.', 'Inception', 2010],
  ['Love means never having to say you’re sorry.', 'Love Story', 1970],
  ['Stella! Hey, Stella!', 'A Streetcar Named Desire', 1951],
  ['Hello, gorgeous.', 'Funny Girl', 1968],
  ['Wilson!', 'Cast Away', 2000],
  ['I’ll have what she’s having.', 'When Harry Met Sally...', 1989],
  ['Bueller? Bueller?', 'Ferris Bueller’s Day Off', 1986],
  ['Snakes. Why’d it have to be snakes?', 'Raiders of the Lost Ark', 1981],
  ['This is Sparta!', '300', 2006],
  ['It’s showtime!', 'Beetlejuice', 1988],
  ['Chewie, we’re home.', 'Star Wars: The Force Awakens', 2015],
  ['Say hello to my little friend!', 'Scarface', 1983],
];

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

async function tmdbKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  return (await getSecret('tmdb'))?.api_key || null;
}
async function tmdbConfigured() { return !!(await tmdbKey()); }

async function tmdb(path, params = {}, override = null) {
  const key = override || await tmdbKey();
  if (!key) throw new Error('TMDB is not connected');
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const headers = { Accept: 'application/json' };
  // v4 "API Read Access Token" (a JWT) goes in the header; a v3 API key goes in the query string
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; else url.searchParams.set('api_key', key);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const DAY0 = Date.UTC(2026, 0, 1);
function dayIndex(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - DAY0) / 86400000);
}

async function film(title, year) {
  return cached(`tmdb:film:${title}:${year}`, 7 * 86400000, async () => {
    const s = await tmdb('/search/movie', { query: title, year, include_adult: false });
    const hit = (s.results || []).find(r => (r.release_date || '').startsWith(String(year))) || (s.results || [])[0];
    if (!hit) return null;
    const [imgs, details] = await Promise.all([
      tmdb(`/movie/${hit.id}/images`, { include_image_language: 'null,en' }),
      tmdb(`/movie/${hit.id}`, { append_to_response: 'credits' }),
    ]);
    // Text-free, well-rated, wide stills first
    const backdrops = (imgs.backdrops || [])
      .filter(b => b.width >= 1280)
      .sort((a, b) => (Number(a.iso_639_1 != null) - Number(b.iso_639_1 != null)) || (b.vote_average - a.vote_average) || (b.vote_count - a.vote_count))
      .slice(0, 8)
      .map(b => b.file_path);
    const director = (details.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name).slice(0, 2).join(' & ') || null;
    return {
      tmdb_id: hit.id,
      title: details.title || hit.title,
      year: (details.release_date || hit.release_date || '').slice(0, 4) || String(year),
      director,
      runtime: details.runtime || null,
      backdrops,
      tmdb_url: `https://www.themoviedb.org/movie/${hit.id}`,
    };
  });
}

/** Today's (or a given day's) line + frame. */
async function dailyInspiration(date = W.localDate(Date.now())) {
  const i = dayIndex(date);
  const [line, title, year] = LINES[((i % LINES.length) + LINES.length) % LINES.length];
  const out = { date, line, title, year, director: null, image_url: null, image_url_small: null, tmdb_url: null, source: null };
  if (!(await tmdbConfigured())) return out;
  try {
    const f = await film(title, year);
    if (f) {
      const pick = f.backdrops.length ? f.backdrops[Math.abs(i) % Math.min(f.backdrops.length, 5)] : null;
      Object.assign(out, {
        title: f.title, year: Number(f.year) || year, director: f.director, tmdb_url: f.tmdb_url,
        image_url: pick ? `${IMG}/w1280${pick}` : null,
        image_url_small: pick ? `${IMG}/w780${pick}` : null,
        source: 'TMDB',
      });
    }
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

/** Check a TMDB key before saving it. */
async function testTmdb(key) {
  const r = await tmdb('/configuration', {}, key);
  return { ok: !!r?.images };
}

module.exports = { dailyInspiration, tmdbConfigured, testTmdb, LINES };
