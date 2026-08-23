import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getBookmarks,
  getQuestionById,
  getCodeSectionById,
  setBookmarkNote,
  toggleBookmarkRef,
  BookmarkRow,
} from '@/lib/database';
import { Question, CodeSection } from '@/lib/types';

interface Entry {
  row: BookmarkRow;
  question: Question | null;
  section: CodeSection | null;
}

export default function BookmarksScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await getBookmarks();
      const resolved = await Promise.all(
        rows.map(async row => {
          const [question, section] = row.kind === 'question'
            ? [await getQuestionById(row.question_id), null as CodeSection | null]
            : [null as Question | null, await getCodeSectionById(row.code_section_id)];
          return { row, question, section };
        })
      );
      setEntries(resolved);
    } catch (e) {
      console.error('Error loading bookmarks:', e);
      setError('Could not load bookmarks.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    setDrafts({});
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function saveNote(id: string, note: string) {
    await setBookmarkNote(id, note);
  }

  async function remove(entry: Entry) {
    await toggleBookmarkRef(
      entry.row.kind,
      entry.row.question_id,
      entry.row.code_section_id
    );
    setEntries(prev => prev.filter(e => e.row.id !== entry.row.id));
  }

  function isQuestion(e: Entry): boolean {
    return e.row.kind === 'question';
  }

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
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loaded && <Text style={styles.loading}>Loading bookmarks...</Text>}

      {loaded && entries.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>⭐</Text>
          <Text style={styles.emptyTitle}>No bookmarks yet</Text>
          <Text style={styles.emptyText}>
            Tap the ☆ on any question (Drill, Mock, Code Reference) or on a code
            section to save it here with your own notes.
          </Text>
        </View>
      )}

      {entries.map(e => {
        const expanded = expandedId === e.row.id;
        const draft = (drafts[e.row.id] ?? e.row.note) || '';
        const heading = isQuestion(e)
          ? e.question?.prompt || 'Question'
          : `${e.section?.section || ''} ${e.section?.title || ''}`;
        return (
          <View key={e.row.id} style={[styles.card, expanded && styles.cardExpanded]}>
            <TouchableOpacity
              style={styles.cardHead}
              onPress={() => setExpandedId(expanded ? null : e.row.id)}
              activeOpacity={0.8}
            >
              <View style={styles.headMain}>
                <View style={styles.headTopRow}>
                  <Text style={[styles.kindBadge, {
                    color: isQuestion(e) ? '#4fc3f7' : '#ff9800',
                    backgroundColor: isQuestion(e) ? '#0d2b3e' : '#3a2e1b',
                  }]}>{isQuestion(e) ? 'QUESTION' : 'CODE SECTION'}</Text>
                  {e.row.note ? <Text style={styles.noteHint}>📝 note</Text> : null}
                </View>
                <Text style={styles.heading} numberOfLines={2}>{heading}</Text>
              </View>
              <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
            </TouchableOpacity>

            {expanded && isQuestion(e) && e.question && (
              <View style={styles.body}>
                <Text style={styles.prompt}>{e.question.prompt}</Text>
                <Text style={styles.answer}>Answer: {e.question.answer}</Text>
                {e.question.explanation ? (
                  <Text style={styles.expl}>{e.question.explanation}</Text>
                ) : null}
                {e.question.code_section ? (
                  <Text style={styles.codeRef}>Code: {e.question.code_section}</Text>
                ) : null}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionLink}
                    onPress={() => router.push(`/drill?topic=${e.question!.topic}`)}
                  >
                    <Text style={styles.actionLinkText}>Drill this topic →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => remove(e)}
                  >
                    <Text style={styles.removeText}>☆ Remove bookmark</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {expanded && !isQuestion(e) && e.section && (
              <View style={styles.body}>
                <Text style={styles.promptBody}>{e.section.section} — {e.section.title}</Text>
                {e.section.short_summary ? (
                  <Text style={styles.expl}>{e.section.short_summary}</Text>
                ) : null}
                {e.section.keywords.length > 0 && (
                  <View style={styles.keywordRow}>
                    {e.section.keywords.map(k => (
                      <View key={k} style={styles.keywordChip}>
                        <Text style={styles.keywordText}>{k}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionLink}
                    onPress={() => router.navigate('/(tabs)/code')}
                  >
                    <Text style={styles.actionLinkText}>Open Code Reference →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => remove(e)}
                  >
                    <Text style={styles.removeText}>☆ Remove bookmark</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {expanded && (
              <TextInput
                style={styles.noteInput}
                placeholder="Add a note (saved when you leave the field)…"
                placeholderTextColor="#5a607a"
                value={draft}
                onChangeText={t => setDrafts(prev => ({ ...prev, [e.row.id]: t }))}
                onBlur={() => {
                  if (draft !== (e.row.note || '')) {
                    void saveNote(e.row.id, draft);
                    setEntries(prev => prev.map(p =>
                      p.row.id === e.row.id ? { ...p, row: { ...p.row, note: draft } } : p
                    ));
                  }
                  setDrafts(prev => {
                    const next = { ...prev };
                    delete next[e.row.id];
                    return next;
                  });
                }}
                multiline
                textAlignVertical="top"
              />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  content: { padding: 16, paddingBottom: 40 },
  loading: { color: '#8892b0', fontSize: 14, textAlign: 'center', marginTop: 24 },
  errorCard: { backgroundColor: '#3a1b1b', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f44336' },
  errorText: { color: '#f44336', fontSize: 14 },
  emptyBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 34, marginBottom: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyText: { color: '#8892b0', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardExpanded: { borderColor: '#4fc3f7' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  headMain: { flex: 1, paddingRight: 8 },
  headTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  kindBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  noteHint: { color: '#ff9800', fontSize: 12 },
  heading: { color: '#e8eaf6', fontSize: 14, lineHeight: 20 },
  chevron: { color: '#4fc3f7', fontSize: 18, paddingTop: 2 },
  body: { paddingHorizontal: 14, paddingBottom: 12 },
  prompt: { color: '#a7adc9', fontSize: 13, fontStyle: 'italic', marginBottom: 8, lineHeight: 18 },
  promptBody: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  answer: { color: '#4caf50', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  expl: { color: '#a7adc9', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  codeRef: { color: '#4fc3f7', fontSize: 12, marginBottom: 10 },
  keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  keywordChip: {
    backgroundColor: '#232648',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  keywordText: { color: '#9fd8f7', fontSize: 11 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionLink: { paddingHorizontal: 4 },
  actionLinkText: { color: '#4fc3f7', fontSize: 13, fontWeight: '600' },
  removeBtn: { paddingHorizontal: 4 },
  removeText: { color: '#8892b0', fontSize: 13 },
  noteInput: {
    backgroundColor: '#141830',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    color: '#fff',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    marginBottom: 6,
    minHeight: 42,
  },
});
