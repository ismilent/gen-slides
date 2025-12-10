import { GoogleGenAI } from "@google/genai";
import { SlidePlan, SlideStyle } from "../types";

// Helper to get client with current key
const getClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Helper for delay to handle rate limits
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generic Retry Wrapper for stability
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delayMs = 3000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries > 0) {
      console.warn(`Operation failed, retrying... (${retries} attempts left). Error: ${error.message}`);
      await delay(delayMs);
      return retryOperation(operation, retries - 1, delayMs * 2); // Exponential backoff
    }
    throw error;
  }
}

/**
 * Step 0: Generate a Strict Design System based on user input.
 * Focuses on High-end, Infographic, and Logic-oriented designs.
 */
export const generateDesignSystem = async (
  customStyle: string,
  styleMode: SlideStyle
): Promise<string> => {
  const ai = getClient();
  
  // Distinguish Layout Density based on Content Mode
  const modeContext = styleMode === SlideStyle.CONCISE 
    ? "LAYOUT: Minimalist, generous whitespace, large typography, focus on visual impact." 
    : "LAYOUT: Editorial grid, multi-column text areas, structured density, information-rich.";
  
  // Default to a universally "Premium Professional" look if user input is empty
  const userContext = customStyle || "Premium Swiss International Style. Clean, Professional, Trustworthy. High contrast, refined typography.";

  const prompt = `
    Role: Senior Art Director for a Fortune 500 Strategy Firm.
    Task: Create a rigid "Visual Design System" (Master Template) for a presentation deck.
    
    AESTHETIC DIRECTION (User Input): "${userContext}"
    CONTENT STRUCTURE (Layout Mode): ${modeContext}

    OBJECTIVE: 
    The design must be "High-End" and "Logic-Oriented". 
    Avoid generic stock photo aesthetics. Prefer "Information Design", "Data Visualization", and "Abstract Logic Graphics".

    Define the following strictly in English:
    1. **Color Palette**: Sophisticated combinations. Define hex codes for Background, Primary Text, Accent 1 (Logic/Charts), Accent 2 (Highlights).
    2. **Typography**: Font pairings (e.g., Bold Geometric Sans for headers, Clean Serif for body).
    3. **Composition Rules**: Margins, grid systems, image treatment (e.g., full bleed vs framed).
    4. **Graphic Elements**: Line weights, corner radius (sharp vs rounded), textures.

    Output format: A concise but detailed paragraph describing this Design System.
  `;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Modern clean business style with blue accents.";
  });
};

/**
 * New Function: Update the Design System based on user feedback.
 */
export const updateDesignSystem = async (
  currentSystem: string,
  adjustment: string
): Promise<string> => {
  const ai = getClient();
  
  const prompt = `
    Role: Senior Art Director.
    Task: Update an existing Design System based on client feedback.

    CURRENT DESIGN SYSTEM:
    "${currentSystem}"

    CLIENT FEEDBACK / ADJUSTMENT REQUEST:
    "${adjustment}"

    INSTRUCTIONS:
    Rewrite the Design System description to incorporate the client's feedback while maintaining coherence and professional quality. 
    Keep the output as a descriptive paragraph.
  `;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || currentSystem;
  });
}

/**
 * Step 1: Generate Slide Plan (JSON)
 * Uses fallback strategy to ensure reliability.
 */
export const generateSlidePlan = async (
  inputText: string, 
  slideCount: number, 
  style: SlideStyle,
  designSystem: string
): Promise<SlidePlan[]> => {
  const ai = getClient();

  const styleInstruction = style === SlideStyle.CONCISE
    ? "STYLE: CONCISE. Very few words. Big impact. Bullet points. No long paragraphs."
    : "STYLE: DETAILED. Comprehensive explanation. Structured paragraphs. High information density.";

  const prompt = `
    Role: Chief Content Strategist & Presentation Logic Expert.
    Task: Split the provided text into a cohesive ${slideCount}-page presentation structure.
    
    INPUT TEXT:
    "${inputText.substring(0, 15000)}"

    DESIGN SYSTEM CONTEXT:
    ${designSystem}

    ${styleInstruction}

    REQUIREMENTS:
    1. **Cover Page**: Slide 1 MUST be a Cover Page with a compelling title.
    2. **Logical Flow**: Ensure a narrative arc. Don't just chop text; structure it for a listener.
    3. **No Hallucinations**: Only use facts from the input text.
    4. **Visuals**: The 'visualDescription' must describe an IMAGE or INFOGRAPHIC that explains the concept. Use the Design System aesthetic.
       - Bad: "A picture of a computer."
       - Good: "A split-screen infographic showing 'Old Process' vs 'New Process' connected by a glowing arrow, using the defined Gold/Black palette."
    5. **Language**: 
       - Title and Content: Simplified Chinese (简体中文).
       - Visual Description: English (for image generator compatibility).

    OUTPUT FORMAT:
    Return a raw JSON array. No markdown code blocks.
    [
      {
        "id": 1,
        "title": "封面标题",
        "content": "副标题或演讲者姓名",
        "visualDescription": "Minimalist typography composition on dark background..."
      },
      ...
    ]
  `;

  // Helper to parse and validate
  const parseResponse = (text: string) => {
    let cleanText = text || "[]";
    // Remove markdown code blocks if present
    cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);
    if (!Array.isArray(parsed)) throw new Error("Output is not an array");
    return parsed.map((item: any) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      visualDescription: item.visualDescription,
      isGenerating: false
    }));
  };

  return retryOperation(async () => {
    try {
        // Attempt 1: Gemini 3 Pro Preview (Best Quality)
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview', // High logic capability model
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        });
        return parseResponse(response.text);
    } catch (e) {
        console.warn("Gemini 3 Pro failed for Slide Plan, falling back to Flash...", e);
        // Attempt 2: Gemini 2.5 Flash (Best Stability/Speed)
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
        });
        return parseResponse(response.text);
    }
  });
};

/**
 * Step 2: Generate Image for a Slide
 * Uses Gemini 3 Pro Image Preview (Nano Banana Pro)
 */
export const generateSlideImage = async (
  slide: SlidePlan,
  designSystem: string
): Promise<string> => {
  const ai = getClient();

  // Combine Global Style + Specific Slide instructions
  // CRITICAL: Explicitly include title and content so the image model renders the text.
  const fullPrompt = `
    [DESIGN SYSTEM / AESTHETIC GUIDE]
    ${designSystem}

    [SLIDE SPECIFIC VISUAL INSTRUCTION]
    ${slide.visualDescription}

    [USER ADJUSTMENTS]
    ${slide.userPromptOverride || "None"}

    [TEXT CONTENT TO RENDER - REQUIRED]
    PLEASE RENDER THE FOLLOWING CHINESE TEXT ON THE SLIDE.
    ENSURE THE TEXT IS CLEAR, LEGIBLE, AND CORRECTLY SPACED.
    
    TITLE: "${slide.title}"
    CONTENT: "${slide.content}"

    [RENDER INSTRUCTIONS]
    1. Create a complete, professional presentation slide.
    2. **MANDATORY**: Render the exact Chinese Title and Content provided above. Do not hallucinate other text.
    3. Ensure high contrast between text and background. 
    4. Typography should match the Design System.
    5. Integrate the text naturally with the infographic or visual elements described.
  `;

  return retryOperation(async () => {
    // Nano Banana Pro / Gemini 3 Pro Image Preview
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: fullPrompt }]
      },
      config: {
        // High quality output
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "2K" // 2048x1152
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from Gemini");
  });
};

/**
 * Helper: Refine Prompt
 */
export const refinePrompt = async (currentPrompt: string): Promise<string> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Optimize this image generation prompt for a presentation slide. Make it more descriptive, artistic, and precise. Keep it in English.\n\nInput: "${currentPrompt}"`
  });
  return response.text || currentPrompt;
};
