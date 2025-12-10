export enum SlideStyle {
  CONCISE = "CONCISE", // Key points, minimal text
  DETAILED = "DETAILED", // Comprehensive text
}

export interface SlidePlan {
  id: number;
  title: string;
  content: string; // The text content to appear on slide
  visualDescription: string; // Instructions for the image model
  userPromptOverride?: string;
  referenceImage?: string; // Base64
  generatedImageUrl?: string;
  isGenerating: boolean;
}

export interface ProjectState {
  step: 'INPUT' | 'PLANNING' | 'WORKBENCH' | 'EXPORT';
  inputText: string;
  targetSlideCount: number;
  selectedStyle: SlideStyle;
  customStylePrompt: string;
  designSystemPrompt: string; // New: Stores the strict visual rules for consistency
  slides: SlidePlan[];
  isProcessing: boolean;
}