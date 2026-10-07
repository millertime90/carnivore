/*
 * Storage adapter.
 * Every method is async and returns plain data so the UI never touches
 * localStorage directly. When the backend exists, replace the bodies of
 * these methods with fetch() calls to the matching endpoints — app.js
 * will not need to change.
 */
const Storage = (() => {
  const KEY = 'carnivoreJournal.v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function write(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    return clone(data);
  }

  function current() {
    return read() || clone(SEED_JOURNAL);
  }

  return {
    /** Load the whole journal (seeds it on first run). */
    async load() {
      const data = read();
      return data ? data : write(clone(SEED_JOURNAL));
    },

    /** Create or update a day entry (matched by id). */
    async saveDay(day) {
      const data = current();
      const i = data.days.findIndex((d) => d.id === day.id);
      if (i >= 0) data.days[i] = day;
      else data.days.push(day);
      return write(data);
    },

    /** Delete a day entry by id. */
    async deleteDay(id) {
      const data = current();
      data.days = data.days.filter((d) => d.id !== id);
      return write(data);
    },

    /** Save overall pattern notes / summary. */
    async saveMeta(meta) {
      const data = current();
      data.meta = { ...data.meta, ...meta };
      return write(data);
    },

    /** Replace everything (used by Import). */
    async replaceAll(journal) {
      return write(journal);
    },

    /** Restore the original seed data from the text log. */
    async reset() {
      return write(clone(SEED_JOURNAL));
    },
  };
})();
