import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "../utils/nanoid";

export interface CardImage {
  id: string;
  data: string;
  order_index: number;
}

export interface AgendaCard {
  id: string;
  meeting_id: string;
  title: string;
  content: string;
  order_index: number;
  images: CardImage[];
}

export interface Meeting {
  id: string;
  title: string;
  held_at: string;
  action_items: string;
  created_at: string;
  updated_at: string;
}

function newCard(meetingId: string, orderIndex: number): AgendaCard {
  return {
    id: nanoid(),
    meeting_id: meetingId,
    title: "",
    content: "",
    order_index: orderIndex,
    images: [],
  };
}

function newMeeting(): Meeting {
  return {
    id: "",
    title: "",
    held_at: new Date().toLocaleString("ja-JP"),
    action_items: "",
    created_at: "",
    updated_at: "",
  };
}

interface EditorStore {
  meeting: Meeting;
  cards: AgendaCard[];
  isDirty: boolean;
  isSaving: boolean;
  llmResult: string;
  isStreaming: boolean;

  // Actions
  setMeeting: (m: Partial<Meeting>) => void;
  setCards: (cards: AgendaCard[]) => void;
  addCardAfter: (afterIndex: number) => void;
  updateCard: (id: string, patch: Partial<AgendaCard>) => void;
  removeCard: (id: string) => void;
  newDocument: () => void;
  loadMeeting: (id: string) => Promise<void>;
  saveMeeting: () => Promise<string>;
  setLlmResult: (text: string) => void;
  appendLlmResult: (chunk: string) => void;
  setIsStreaming: (v: boolean) => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  meeting: newMeeting(),
  cards: [newCard("", 0)],
  isDirty: false,
  isSaving: false,
  llmResult: "",
  isStreaming: false,

  setMeeting: (m) =>
    set((s) => ({ meeting: { ...s.meeting, ...m }, isDirty: true })),

  setCards: (cards) => set({ cards, isDirty: true }),

  addCardAfter: (afterIndex) =>
    set((s) => {
      const cards = [...s.cards];
      const newC = newCard(s.meeting.id, afterIndex + 1);
      cards.splice(afterIndex + 1, 0, newC);
      const reindexed = cards.map((c, i) => ({ ...c, order_index: i }));
      return { cards: reindexed, isDirty: true };
    }),

  updateCard: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      isDirty: true,
    })),

  removeCard: (id) =>
    set((s) => {
      const filtered = s.cards
        .filter((c) => c.id !== id)
        .map((c, i) => ({ ...c, order_index: i }));
      // Always keep at least one card
      if (filtered.length === 0) {
        filtered.push(newCard(s.meeting.id, 0));
      }
      return { cards: filtered, isDirty: true };
    }),

  newDocument: () =>
    set({
      meeting: newMeeting(),
      cards: [newCard("", 0)],
      isDirty: false,
      llmResult: "",
    }),

  loadMeeting: async (id) => {
    const result = await invoke<{ meeting: Meeting; cards: AgendaCard[] }>(
      "get_meeting",
      { id }
    );
    set({
      meeting: result.meeting,
      cards: result.cards,
      isDirty: false,
      llmResult: "",
    });
  },

  saveMeeting: async () => {
    const { meeting, cards } = get();
    set({ isSaving: true });
    try {
      const id = await invoke<string>("save_meeting", {
        meeting,
        cards: cards.map((c, i) => ({ ...c, order_index: i })),
      });
      set((s) => ({
        meeting: { ...s.meeting, id },
        isDirty: false,
        isSaving: false,
      }));
      return id;
    } catch (e) {
      set({ isSaving: false });
      throw e;
    }
  },

  setLlmResult: (text) => set({ llmResult: text }),
  appendLlmResult: (chunk) =>
    set((s) => ({ llmResult: s.llmResult + chunk })),
  setIsStreaming: (v) => set({ isStreaming: v }),
}));
