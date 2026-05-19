import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';

type SubtitleScreenProps = StackScreenProps<RootStackParamList, 'Subtitles'>;

interface TranslatedCue {
  text: string;
  start: number;
  duration: number;
  translated: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface CueItemProps {
  item: TranslatedCue;
  index: number;
}

const CueItem = React.memo(function CueItem({ item, index }: CueItemProps) {
  return (
    <View style={[styles.cueItem, index % 2 === 0 ? styles.cueItemEven : styles.cueItemOdd]}>
      <Text style={styles.timing}>{formatTime(item.start)}</Text>
      <View style={styles.cueContent}>
        <Text style={styles.translatedText}>{item.translated}</Text>
        <Text style={styles.originalText}>{item.text}</Text>
      </View>
    </View>
  );
});

export default function SubtitleScreen() {
  const route = useRoute<SubtitleScreenProps['route']>();
  const { cues } = route.params;
  const flatListRef = useRef<FlatList>(null);
  const [autoScroll, setAutoScroll] = useState(false);

  const handleShare = useCallback(async () => {
    const text = cues
      .map((c) => `[${formatTime(c.start)}] ${c.translated}\n${c.text}`)
      .join('\n\n');
    try {
      await Share.share({ message: text });
    } catch {
      Alert.alert('Error', 'Could not share subtitles.');
    }
  }, [cues]);

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: TranslatedCue; index: number }) => (
      <CueItem item={item} index={index} />
    ),
    []
  );

  const keyExtractor = useCallback((_: TranslatedCue, index: number) => index.toString(), []);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarInfo}>{cues.length} subtitles</Text>
        <View style={styles.toolbarButtons}>
          <TouchableOpacity style={styles.toolbarButton} onPress={scrollToTop}>
            <Text style={styles.toolbarButtonText}>Top</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, autoScroll && styles.toolbarButtonActive]}
            onPress={toggleAutoScroll}
          >
            <Text
              style={[styles.toolbarButtonText, autoScroll && styles.toolbarButtonTextActive]}
            >
              Auto
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarButton} onPress={handleShare}>
            <Text style={styles.toolbarButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={cues as TranslatedCue[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        maxToRenderPerBatch={30}
        windowSize={10}
        getItemLayout={(_, index) => ({
          length: 90,
          offset: 90 * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  toolbarInfo: {
    color: '#666',
    fontSize: 13,
  },
  toolbarButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  toolbarButtonActive: {
    backgroundColor: '#4A9EFF',
  },
  toolbarButtonText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
  },
  toolbarButtonTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingVertical: 8,
  },
  cueItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 90,
    alignItems: 'flex-start',
    gap: 10,
  },
  cueItemEven: {
    backgroundColor: '#0f0f0f',
  },
  cueItemOdd: {
    backgroundColor: '#141414',
  },
  timing: {
    color: '#555',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 3,
    minWidth: 36,
  },
  cueContent: {
    flex: 1,
    gap: 4,
  },
  translatedText: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
  },
  originalText: {
    color: '#666',
    fontSize: 12,
    lineHeight: 17,
  },
});
