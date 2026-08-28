import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAllCodeSections,
  searchCodeSections,
  getQuestionsForCodeSection,
  getQuestionCountsByCodeSection,
  getBookmarkMap,
  toggleBookmarkRef,
} from '@/lib/database';
import { CodeSection, Question } from '@/lib/types';

export default function CodeScreen() {
  const [sections, setSections] = useState<CodeSection[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questionsBySection, setQuestionsBySection] = useState<Record<string, Question[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [bookmarks, setBookmarks] = useState<Map<string, unknown>>(new Map());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Coalesce loads per query: useFocusEffect + the debounced effect can both
  // fire load('') on mount → two concurrent cold OPFS inits race and one
  // throws (the web first-hard-load flake). Track the in-flight query so an
  // identical pending load is skipped and a stale result never stamps over a
  // newer one.
  const inFlight = useRef<string | null>(null);

  const load = useCallback(async (q: string) => {
    if (inFlight.current === q) return; // same query already in flight
    inFlight.current = q;
    const token = q;
    try {
      setError(null);
      setLoaded(false);
      const [secs, countsMap, bmMap] = await Promise.all([
        q.trim() ? searchCodeSections(q.trim()) : getAllCodeSections(),
        getQuestionCountsByCodeSection(),
        getBookmarkMap(),
      ]);
      if (inFlight.current !== token) return; // a newer query superseded us
      setSections(secs);
      setCounts(Object.fromEntries(countsMap));
      setBookmarks(bmMap);
    } catch (e) {
      console.error('Error loading code sections:', e);
      if (inFlight.current === token) setError('Could not load code sections.');
    } finally {
      if (inFlight.current === token) { inFlight.current = null; setLoaded(true); }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(query);
    }, [load, query])
  );

  // Debounce typing so we don't hit SQLite on every keystroke
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      load(query);
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(query);
    setRefreshing(false);
  }

  async function toggleSectionBookmark(s: CodeSection) {
    await toggleBookmarkRef('code_section', '', s.id);
    await load(query); // re-read map so UI state stays true
  }

  async function toggleQuestionBookmark(q: Question) {
    await toggleBookmarkRef('question', q.id, '');
    await load(query);
  }

  async function expand(s: CodeSection) {
    if (expandedId === s.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(s.id);
    if (!questionsBySection[s.id]) {
      const qs = await getQuestionsForCodeSection(s.section);
      setQuestionsBySection(prev => ({ ...prev, [s.id]: qs }));
    }
  }

  const isBookmarked = (key: string) => bookmarks.has(key);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#4fc3f7"
          colors={['#4fc3f7']}
        />
      }
    >
      {/* Search */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search section, title, or keyword…"
        placeholderTextColor="#5a607a"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={onRefresh}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Load again</Text>
          </TouchableOpacity>
        </View>
      )}
      {!loaded && <Text style={styles.loading}>Loading code sections...</Text>}

      {loaded && !error && sections.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyText}>
            Nothing in the code reference matches "{query}". Try a number like
            "20:090" or a word like "venting".
          </Text>
        </View>
      )}

      {/* Sections list */}
      {sections.map(s => {
        const expanded = expandedId === s.id;
        const qs = questionsBySection[s.id] || [];
        const n = counts[s.section] ?? 0;
        const bmKey = `code_section:${s.id}`;
        const bookmarked = isBookmarked(bmKey);
        return (
          <View key={s.id} style={[styles.sectionCard, expanded && styles.sectionCardExpanded]}>
            <TouchableOpacity style={styles.sectionHead} onPress={() => expand(s)} activeOpacity={0.8}>
              <View style={flex1}>
                <Text style={styles.sectionNum}>{s.section}</Text>
                <Text style={styles.sectionTitle} numberOfLines={2}>{s.title}</Text>
                <Text style={styles.sectionSummary} numberOfLines={2}>{s.short_summary}</Text>
                <Text style={styles.sectionMeta}>
                  {n > 0 ? `${n} question${n > 1 ? 's' : ''} linked` : 'No questions linked yet'}
                  {s.keywords.length > 0 ? ` · ${s.keywords.slice(0, 3).join(', ')}` : ''}
                </Text>
              </View>
              <View style={styles.sectionChevron}>
                <TouchableOpacity
                  onPress={() => toggleSectionBookmark(s)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.bookmarkStar, { color: bookmarked ? '#4fc3f7' : '#5a607a' }]}>
                    {bookmarked ? '★' : '☆'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.chevronText}>{expanded ? '▾' : '▸'}</Text>
              </View>
            </TouchableOpacity>

            {expanded && (
              <View style={styles.expandBox}>
                {s.keywords.length > 0 && (
                  <View style={styles.keywordRow}>
                    {s.keywords.map(k => (
                      <View key={k} style={styles.keywordChip}>
                        <Text style={styles.keywordText}>{k}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {qs.length === 0 ? (
                  <Text style={styles.emptyInline}>
                    No verified questions reference {s.section} yet — they'll show up here the
                    moment content is added.
                  </Text>
                ) : (
                  qs.map(q => {
                    const qBm = isBookmarked(`question:${q.id}`);
                    return (
                      <View key={q.id} style={styles.qCard}>
                        <Text style={styles.qPrompt}>{q.prompt}</Text>
                        <Text style={styles.qAnswer}>Answer: {q.answer}</Text>
                        {q.explanation ? <Text style={styles.qExpl}>{q.explanation}</Text> : null}
                        <TouchableOpacity
                          onPress={() => toggleQuestionBookmark(q)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.qBookmarkBtn}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.qBookmarkStar, { color: qBm ? '#4fc3f7' : '#5a607a' }]}>
                            {qBm ? '★' : '☆'}
                          </Text>
                          <Text style={{ color: qBm ? '#4fc3f7' : '#8892b0', fontSize: 12, marginLeft: 6 }}>
                            {qBm ? 'Bookmarked' : 'Bookmark'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const flex1 = { flex: 1, paddingRight: 8 } as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  content: { padding: 16, paddingBottom: 40 },
  searchInput: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    marginBottom: 16,
  },
  errorCard: { backgroundColor: '#3a1b1b', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f44336', alignItems: 'flex-start' },
  retryBtn: { backgroundColor: '#4fc3f7', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 12 },
  retryText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 14 },
  errorText: { color: '#f44336', fontSize: 14 },
  loading: { color: '#8892b0', fontSize: 14, textAlign: 'center', marginTop: 24 },
  emptyBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  emptyText: { color: '#8892b0', fontSize: 13, textAlign: 'center' },
  emptyInline: { color: '#8892b0', fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  sectionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionCardExpanded: { borderColor: '#4fc3f7' },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  sectionNum: { color: '#4fc3f7', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  sectionSummary: { color: '#a7adc9', fontSize: 13, lineHeight: 18, marginBottom: 6 },
  sectionMeta: { color: '#6c7293', fontSize: 11 },
  sectionChevron: { alignItems: 'center', justifyContent: 'center', paddingLeft: 4, paddingTop: 4 },
  bookmarkStar: { fontSize: 22, marginBottom: 6 },
  chevronText: { color: '#4fc3f7', fontSize: 18 },
  expandBox: { padding: 0, paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#2a2a4e', paddingTop: 10 },
  keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  keywordChip: {
    backgroundColor: '#232648',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  keywordText: { color: '#9fd8f7', fontSize: 11 },
  qCard: {
    backgroundColor: '#141830',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4fc3f7',
  },
  qPrompt: { color: '#e8eaf6', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  qAnswer: { color: '#4caf50', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  qExpl: { color: '#a7adc9', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  qBookmarkBtn: { flexDirection: 'row', alignItems: 'center' },
  qBookmarkStar: { fontSize: 16 },
});
