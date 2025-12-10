import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { 
  SlideStyle, 
  SlidePlan, 
  ProjectState 
} from './types';
import { 
  generateSlidePlan, 
  generateSlideImage, 
  refinePrompt, 
  generateDesignSystem,
  updateDesignSystem 
} from './services/geminiService';
import { Button } from './components/Button';
import { 
  IconSparkles, IconFileText, IconImage, IconDownload, IconRefresh, IconUpload, IconEdit, IconCheck, IconArrowLeft, IconPalette, IconClose, IconPlus
} from './components/Icons';

const App: React.FC = () => {
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Project State
  const [state, setState] = useState<ProjectState>({
    step: 'INPUT',
    inputText: '',
    targetSlideCount: 10,
    selectedStyle: SlideStyle.CONCISE,
    customStylePrompt: '',
    designSystemPrompt: '',
    slides: [],
    isProcessing: false,
  });

  // Ref to track slides for async operations (daisy-chaining)
  const slidesRef = useRef<SlidePlan[]>([]);
  useEffect(() => {
    slidesRef.current = state.slides;
  }, [state.slides]);

  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [showLargePreview, setShowLargePreview] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Global Style Adjustment State
  const [isStyleModalOpen, setStyleModalOpen] = useState(false);
  const [styleAdjustment, setStyleAdjustment] = useState('');
  const [isUpdatingStyle, setIsUpdatingStyle] = useState(false);

  // Check API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (process.env.API_KEY) {
        setApiKeyReady(true);
        return;
      }
      const aiStudio = (window as any).aistudio;
      if (aiStudio && typeof aiStudio.hasSelectedApiKey === 'function') {
        if (await aiStudio.hasSelectedApiKey()) {
          setApiKeyReady(true);
        }
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (process.env.API_KEY) {
      setApiKeyReady(true);
      return;
    }
    try {
      const aiStudio = (window as any).aistudio;
      if (aiStudio) {
        await aiStudio.openSelectKey();
        if (await aiStudio.hasSelectedApiKey()) {
          setApiKeyReady(true);
        }
      } else {
        alert("本地环境提示：未检测到 AI Studio 集成环境。\n\n要在本地运行，请确保您的构建环境（如 Vite/Webpack）已注入 'process.env.API_KEY' 环境变量。");
      }
    } catch (e) {
      console.error(e);
      alert("无法选择 API Key，请重试。");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setState(prev => ({ ...prev, inputText: text }));
    };
    reader.readAsText(file);
  };

  const handleGeneratePlan = async () => {
    if (!state.inputText.trim()) {
      alert("请输入内容或上传文档");
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true }));
    setErrorMsg(null);

    try {
      // 1. Determine Global Design System
      // Logic Update: If user provides a custom style, use it directly (skip AI enhancement).
      // Only call generateDesignSystem (AI) if the user input is empty.
      let designSystem = state.customStylePrompt.trim();
      
      if (!designSystem) {
        designSystem = await generateDesignSystem(
          state.customStylePrompt, 
          state.selectedStyle
        );
      }

      // 2. Generate the Slide Plan using the content and the design system
      const plan = await generateSlidePlan(
        state.inputText, 
        state.targetSlideCount, 
        state.selectedStyle,
        designSystem
      );

      setState(prev => ({
        ...prev,
        step: 'PLANNING',
        slides: plan,
        designSystemPrompt: designSystem,
        isProcessing: false
      }));
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || "生成失败，请重试");
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleUpdateSlide = (id: number, field: keyof SlidePlan, value: string) => {
    setState(prev => ({
      ...prev,
      slides: prev.slides.map(s => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const handleAddSlide = () => {
    const newId = state.slides.length > 0 ? Math.max(...state.slides.map(s => s.id)) + 1 : 1;
    const newSlide: SlidePlan = {
      id: newId,
      title: "新幻灯片",
      content: "在此输入正文内容...",
      visualDescription: "Describe the visual structure for this slide in English...",
      isGenerating: false
    };
    setState(prev => ({
      ...prev,
      slides: [...prev.slides, newSlide]
    }));
  };

  const startWorkbench = async () => {
    setState(prev => ({ ...prev, step: 'WORKBENCH', isProcessing: true }));
    
    // Generate first slide immediately and enable auto-chaining
    const firstSlide = state.slides[0];
    if (firstSlide) {
        // Delay slightly to allow state to settle
        setTimeout(() => {
          generateSingleSlideImage(firstSlide.id, true);
        }, 100);
    }
    
    setState(prev => ({ ...prev, isProcessing: false }));
  };

  const generateSingleSlideImage = async (id: number, autoChain: boolean = false) => {
    // Check if we should skip (for auto-chain only)
    if (autoChain) {
       const currentSlides = slidesRef.current;
       const target = currentSlides.find(s => s.id === id);
       // Skip if already has image or is currently generating
       if (target && (target.generatedImageUrl || target.isGenerating)) {
          // If this one is skipped, try the next one? 
          // For simplicity, let's just find the next ungenerated one.
          const currentIndex = currentSlides.findIndex(s => s.id === id);
          if (currentIndex !== -1 && currentIndex < currentSlides.length - 1) {
             generateSingleSlideImage(currentSlides[currentIndex + 1].id, true);
          }
          return;
       }
    }

    const slideIndex = slidesRef.current.findIndex(s => s.id === id);
    if (slideIndex === -1) return;

    const slide = slidesRef.current[slideIndex];
    
    // Optimistic UI update
    setState(prev => ({
      ...prev,
      slides: prev.slides.map(s => s.id === id ? { ...s, isGenerating: true } : s)
    }));

    // Auto-scroll to the slide being generated if auto-chaining
    if (autoChain) {
        setActiveSlideIndex(slideIndex);
    }

    try {
      const imageUrl = await generateSlideImage(slide, state.designSystemPrompt);
      
      setState(prev => ({
        ...prev,
        slides: prev.slides.map(s => s.id === id ? { 
          ...s, 
          generatedImageUrl: imageUrl, 
          isGenerating: false 
        } : s)
      }));

      // --- AUTO CHAIN LOGIC ---
      if (autoChain) {
         // Use Ref to get latest state after await
         const currentSlides = slidesRef.current;
         const finishedIndex = currentSlides.findIndex(s => s.id === id);
         
         if (finishedIndex !== -1 && finishedIndex < currentSlides.length - 1) {
            const nextSlide = currentSlides[finishedIndex + 1];
            // Only continue if the next slide doesn't have an image and isn't generating
            if (!nextSlide.generatedImageUrl && !nextSlide.isGenerating) {
                // Determine delays for better UX
                setTimeout(() => {
                    generateSingleSlideImage(nextSlide.id, true);
                }, 500);
            }
         }
      }
      // ------------------------

    } catch (error) {
      console.error(error);
      setState(prev => ({
        ...prev,
        slides: prev.slides.map(s => s.id === id ? { ...s, isGenerating: false } : s)
      }));
      // Even on error, maybe try next one? No, let's stop on error.
      alert(`页面 ${id} 生成失败，自动生成已暂停。`);
    }
  };

  const handleRefinePrompt = async (id: number) => {
    const slide = state.slides.find(s => s.id === id);
    if (!slide) return;

    setState(prev => ({ ...prev, isProcessing: true }));
    try {
      const refined = await refinePrompt(slide.visualDescription);
      handleUpdateSlide(id, 'visualDescription', refined);
    } catch (e) {
      alert("优化失败");
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleUpdateGlobalStyle = async () => {
    if (!styleAdjustment.trim()) return;
    
    setIsUpdatingStyle(true);
    try {
      const newSystem = await updateDesignSystem(state.designSystemPrompt, styleAdjustment);
      setState(prev => ({ ...prev, designSystemPrompt: newSystem }));
      setStyleModalOpen(false);
      setStyleAdjustment('');
      alert("全局设计风格已更新！\n\n请点击各个页面的“重新生成”按钮以应用新风格。");
    } catch (e) {
      console.error(e);
      alert("更新失败，请重试");
    } finally {
      setIsUpdatingStyle(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    state.slides.forEach((slide, index) => {
      if (index > 0) doc.addPage();

      if (slide.generatedImageUrl) {
        doc.addImage(slide.generatedImageUrl, 'PNG', 0, 0, width, height);
      } else {
        // Fallback text if image not generated
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, width, height, 'F');
        doc.setFontSize(24);
        doc.setTextColor(0, 0, 0);
        doc.text(slide.title, 20, 30);
        doc.setFontSize(14);
        const splitText = doc.splitTextToSize(slide.content, width - 40);
        doc.text(splitText, 20, 50);
      }
    });

    doc.save('presentation.pdf');
  };

  // --- VIEWS ---

  if (!apiKeyReady) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-white border border-paper-300 rounded-2xl mx-auto shadow-sm flex items-center justify-center">
             <IconSparkles className="text-accent w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif text-ink font-bold tracking-tight">Gemini SlideCraft Pro</h1>
          <p className="text-ink-light leading-relaxed">需要 API 密钥才能访问 Gemini 3 Pro 模型。</p>
          <div className="p-4 bg-white border border-paper-300 rounded-lg shadow-sm text-sm text-ink-light text-left">
             <p className="mb-2"><strong>注意：</strong> 使用 Veo 和高级图像生成模型需要付费的 GCP 项目 API 密钥。</p>
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-accent hover:underline decoration-accent/30 underline-offset-4">查看计费文档 &rarr;</a>
          </div>
          <Button onClick={handleSelectKey} className="w-full py-3 text-lg">
            连接 Google AI Studio
          </Button>
        </div>
      </div>
    );
  }

  // 1. INPUT STEP
  if (state.step === 'INPUT') {
    return (
      <div className="min-h-screen bg-paper font-sans">
        <header className="bg-white/80 backdrop-blur-md border-b border-paper-300 py-4 px-6 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-sm">
                 <IconSparkles className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-serif font-bold text-ink">Gemini SlideCraft Pro</h1>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-8 space-y-12">
          <div className="text-center space-y-4 py-8">
            <h2 className="text-4xl font-serif text-ink font-bold tracking-tight">创建您的演示文稿</h2>
            <p className="text-ink-light text-lg max-w-2xl mx-auto leading-relaxed">
              智能拆解文档，生成逻辑清晰、设计精美的专业幻灯片
            </p>
          </div>

          {/* Section 1: Content Structure */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
               <h3 className="text-xl font-serif font-bold text-ink">1. 内容结构模板</h3>
               <span className="text-xs font-medium text-ink-light bg-paper-200 px-3 py-1 rounded-full uppercase tracking-wide">必选</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div 
                onClick={() => setState(prev => ({ ...prev, selectedStyle: SlideStyle.CONCISE }))}
                className={`cursor-pointer p-8 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${state.selectedStyle === SlideStyle.CONCISE ? 'border-accent bg-white shadow-md' : 'border-paper-300 bg-paper-50 hover:bg-white hover:border-paper-300 hover:shadow-sm'}`}
              >
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-serif font-bold text-ink text-xl">要点凝练型</h4>
                    {state.selectedStyle === SlideStyle.CONCISE && <div className="bg-accent text-white p-1 rounded-full"><IconCheck className="w-4 h-4" /></div>}
                  </div>
                  <p className="text-ink-light text-sm leading-relaxed">
                    大字号，少文字。适合现场演讲辅助，强调视觉冲击力与核心观点。
                  </p>
                </div>
              </div>

              <div 
                onClick={() => setState(prev => ({ ...prev, selectedStyle: SlideStyle.DETAILED }))}
                className={`cursor-pointer p-8 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${state.selectedStyle === SlideStyle.DETAILED ? 'border-accent bg-white shadow-md' : 'border-paper-300 bg-paper-50 hover:bg-white hover:border-paper-300 hover:shadow-sm'}`}
              >
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-serif font-bold text-ink text-xl">详细展示型</h4>
                    {state.selectedStyle === SlideStyle.DETAILED && <div className="bg-accent text-white p-1 rounded-full"><IconCheck className="w-4 h-4" /></div>}
                  </div>
                  <p className="text-ink-light text-sm leading-relaxed">
                    信息丰富，结构严谨。适合阅读材料、工作汇报或需要独立传阅的文档。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Global Aesthetic */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
               <h3 className="text-xl font-serif font-bold text-ink">2. 全局审美风格</h3>
               <span className="text-xs font-medium text-ink-light bg-paper-200 px-3 py-1 rounded-full uppercase tracking-wide">可选</span>
            </div>
            <div className="bg-white border border-paper-300 rounded-2xl p-8 shadow-sm">
                <p className="text-sm text-ink-light mb-4 leading-relaxed">
                    描述您希望的整体视觉风格（例如：“极简主义，深蓝色调，科技感”，“复古纸张风格，暖色调，手绘元素”）。
                    如果不填写，AI 将根据“内容结构”自动生成一套高级、统一的专业设计系统。
                </p>
                <input 
                    type="text" 
                    placeholder="例如：高端商务风格，使用黑金配色，强调数据可视化的专业感..." 
                    className="w-full p-4 bg-paper-50 border border-paper-300 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all placeholder:text-ink-faint"
                    value={state.customStylePrompt}
                    onChange={(e) => setState(prev => ({ ...prev, customStylePrompt: e.target.value }))}
                />
            </div>
          </section>

          {/* Section 3: Document Upload */}
          <section className="space-y-6">
             <div className="flex items-center justify-between">
               <h3 className="text-xl font-serif font-bold text-ink">3. 上传文档资料</h3>
               <span className="text-xs font-medium text-ink-light bg-paper-200 px-3 py-1 rounded-full uppercase tracking-wide">输入内容</span>
            </div>
            <div className="bg-white border border-paper-300 rounded-2xl p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-paper-200 pb-6">
                    <label className="flex items-center gap-3 px-5 py-2.5 bg-paper-50 hover:bg-paper-100 text-ink rounded-lg cursor-pointer transition-colors border border-paper-300 font-medium text-sm">
                        <IconUpload className="w-5 h-5 text-accent" />
                        <span>选择文件 (TXT, MD)</span>
                        <input 
                            type="file" 
                            accept=".txt,.md" 
                            onChange={handleFileUpload} 
                            ref={fileInputRef}
                            className="hidden" 
                        />
                    </label>
                    <div className="flex items-center gap-3">
                         <span className="text-sm font-medium text-ink-light">预计页数:</span>
                         <input 
                            type="number" 
                            min={1} 
                            max={30} 
                            value={state.targetSlideCount}
                            onChange={(e) => setState(prev => ({ ...prev, targetSlideCount: parseInt(e.target.value) || 5 }))}
                            className="w-20 p-2.5 bg-paper-50 border border-paper-300 rounded-lg text-center font-medium focus:ring-1 focus:ring-accent outline-none"
                         />
                    </div>
                </div>

                <div className="relative group">
                    <textarea 
                        className="w-full h-64 p-6 bg-paper-50 border border-paper-300 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none resize-none font-mono text-sm leading-loose text-ink transition-all placeholder:text-ink-faint group-hover:bg-white"
                        placeholder="或者直接在这里粘贴您的文本内容..."
                        value={state.inputText}
                        onChange={(e) => setState(prev => ({ ...prev, inputText: e.target.value }))}
                    ></textarea>
                </div>
            </div>
          </section>

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <span>⚠️</span> {errorMsg}
            </div>
          )}

          <div className="flex justify-end pt-4 pb-12">
            <Button 
                onClick={handleGeneratePlan} 
                disabled={!state.inputText || state.isProcessing}
                className="w-full md:w-auto px-12 py-4 text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all"
                isLoading={state.isProcessing}
            >
                开始生成幻灯片大纲 &rarr;
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // 2. PLANNING STEP
  if (state.step === 'PLANNING') {
    return (
      <div className="min-h-screen bg-paper flex flex-col font-sans">
        <header className="bg-white/80 backdrop-blur-md border-b border-paper-300 py-4 px-6 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <button onClick={() => setState(prev => ({ ...prev, step: 'INPUT' }))} className="text-ink-light hover:text-ink flex items-center gap-2 text-sm font-medium transition-colors">
              <IconArrowLeft className="w-4 h-4" /> 返回编辑
            </button>
            <h1 className="text-lg font-serif font-bold text-ink">审查幻灯片大纲</h1>
            <Button onClick={startWorkbench} variant="primary">
               确认并进入工作台 &rarr;
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="p-5 bg-paper-50 border border-paper-300 rounded-xl text-ink-light text-sm flex gap-3 items-start">
                    <IconSparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                    <p className="leading-relaxed">这是 AI 为您规划的演示逻辑。请检查并修改每一页的标题、正文内容和视觉描述，以确保最终生成的幻灯片符合您的预期。</p>
                </div>

                {state.slides.map((slide) => (
                    <div key={slide.id} className="bg-white rounded-2xl shadow-sm border border-paper-200 p-8 flex flex-col gap-8 transition-all hover:shadow-md hover:border-paper-300">
                        <div className="flex items-center gap-4 border-b border-paper-100 pb-4">
                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-paper-100 text-ink font-serif font-bold text-sm">
                                {slide.id}
                            </span>
                            <input 
                                value={slide.title} 
                                onChange={(e) => handleUpdateSlide(slide.id, 'title', e.target.value)}
                                className="flex-1 text-xl font-serif font-bold text-ink bg-transparent focus:bg-paper-50 rounded px-2 -ml-2 border border-transparent focus:border-paper-200 outline-none transition-all"
                                placeholder="输入标题..."
                            />
                        </div>

                        <div className="flex flex-col md:flex-row gap-8">
                            {/* Content */}
                            <div className="flex-1 space-y-3">
                                <label className="text-xs font-bold text-ink-light uppercase tracking-wider pl-1">正文内容</label>
                                <textarea 
                                    value={slide.content} 
                                    onChange={(e) => handleUpdateSlide(slide.id, 'content', e.target.value)}
                                    className="w-full h-40 text-base text-ink bg-paper-50 border border-paper-200 rounded-xl p-4 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none resize-none leading-relaxed transition-all"
                                    placeholder="输入正文内容..."
                                />
                            </div>

                            {/* Visual Instructions */}
                            <div className="flex-1 space-y-3">
                                 <div className="flex justify-between items-center pl-1">
                                    <label className="text-xs font-bold text-ink-light uppercase tracking-wider flex items-center gap-2">
                                        <IconImage className="w-3 h-3" /> 视觉描述 (Prompt)
                                    </label>
                                    <button 
                                        onClick={() => handleRefinePrompt(slide.id)}
                                        className="text-xs text-accent hover:text-accent-hover font-medium flex items-center gap-1 bg-accent-subtle px-2 py-1 rounded-full transition-colors"
                                        disabled={state.isProcessing}
                                    >
                                        <IconSparkles className="w-3 h-3" /> AI 优化
                                    </button>
                                 </div>
                                 <textarea 
                                    value={slide.visualDescription} 
                                    onChange={(e) => handleUpdateSlide(slide.id, 'visualDescription', e.target.value)}
                                    className="w-full h-40 text-sm text-ink-light bg-white border border-paper-200 rounded-xl p-4 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none resize-none font-mono leading-relaxed shadow-inner"
                                    placeholder="Visual description in English..."
                                 />
                            </div>
                        </div>
                    </div>
                ))}

                {/* Manual Add Slide Button */}
                <div className="flex justify-center pb-12">
                    <Button variant="secondary" onClick={handleAddSlide} className="w-full py-4 border-dashed border-2 border-paper-300 hover:border-accent hover:text-accent bg-paper-50 text-ink-light hover:bg-white flex items-center justify-center gap-2 transition-all rounded-xl">
                        <IconPlus className="w-5 h-5" />
                        添加新幻灯片
                    </Button>
                </div>
            </div>
        </main>
      </div>
    );
  }

  // 3. WORKBENCH STEP
  return (
    <div className="h-screen flex bg-paper-100 overflow-hidden font-sans text-ink">
        {/* Sidebar */}
        <aside className="w-72 bg-paper border-r border-paper-300 flex flex-col overflow-hidden z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
            <div className="h-16 px-4 border-b border-paper-200 flex justify-between items-center bg-paper/50 backdrop-blur">
                 <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => setState(prev => ({ ...prev, step: 'PLANNING' }))} className="p-1 text-ink-light hover:text-ink" title="返回大纲">
                        <IconArrowLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="font-serif font-bold text-ink text-lg">幻灯片概览</h2>
                </div>
                <Button variant="ghost" onClick={exportPDF} title="导出 PDF" className="p-2 hover:bg-paper-200 rounded-full">
                    <IconDownload className="w-5 h-5 text-ink-light" />
                </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {state.slides.map((slide, index) => (
                    <div 
                        key={slide.id}
                        onClick={() => setActiveSlideIndex(index)}
                        className={`group p-3 rounded-xl cursor-pointer border transition-all duration-200 flex items-center gap-3 relative ${index === activeSlideIndex ? 'bg-white border-paper-300 shadow-sm ring-1 ring-black/5' : 'bg-transparent border-transparent hover:bg-paper-200'}`}
                    >
                        <span className={`text-xs font-bold w-5 transition-colors ${index === activeSlideIndex ? 'text-accent' : 'text-paper-300 group-hover:text-ink-light'}`}>{slide.id}</span>
                        <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-medium truncate ${index === activeSlideIndex ? 'text-ink' : 'text-ink-light group-hover:text-ink'}`}>{slide.title}</h4>
                            <p className="text-[10px] text-ink-faint truncate mt-0.5">{slide.isGenerating ? '正在生成...' : (slide.generatedImageUrl ? '已完成' : '待生成')}</p>
                        </div>
                        {slide.generatedImageUrl && (
                           <div className="w-8 h-6 bg-cover bg-center rounded border border-paper-200 shadow-sm" style={{ backgroundImage: `url(${slide.generatedImageUrl})` }}></div>
                        )}
                    </div>
                ))}
            </div>
            <div className="p-4 border-t border-paper-200 bg-paper-50">
               <div className="text-xs text-ink-faint text-center">
                 Gemini 3 Pro + Nano Banana
               </div>
            </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col min-w-0 bg-paper-200/50 relative">
            {state.slides[activeSlideIndex] && (
                <>
                {/* Toolbar */}
                <div className="h-16 bg-white border-b border-paper-300 flex items-center justify-between px-8 shadow-sm z-10">
                    <div className="flex items-center gap-4 overflow-hidden">
                        <span className="text-sm font-bold text-ink-light bg-paper-100 px-2 py-1 rounded">#{state.slides[activeSlideIndex].id}</span>
                        <h3 className="font-serif text-xl font-bold text-ink truncate max-w-lg">
                            {state.slides[activeSlideIndex].title}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                         <Button 
                            variant="secondary"
                            onClick={() => setStyleModalOpen(true)}
                            className="flex items-center gap-2 text-sm px-4 py-2"
                         >
                            <IconPalette className="w-4 h-4 text-ink-light" /> 调整全局风格
                         </Button>

                         <Button 
                            variant="primary" 
                            onClick={() => generateSingleSlideImage(state.slides[activeSlideIndex].id)}
                            isLoading={state.slides[activeSlideIndex].isGenerating}
                            className="flex items-center gap-2 text-sm px-4 py-2"
                         >
                            <IconRefresh className="w-4 h-4" /> 重新生成
                         </Button>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 p-8 flex items-center justify-center overflow-auto relative bg-[#e7e5e4]/30">
                    <div className="relative w-full max-w-6xl aspect-video bg-white shadow-2xl rounded-sm ring-1 ring-black/5 flex flex-col overflow-hidden group">
                        
                        {/* Slide Content Display */}
                        {state.slides[activeSlideIndex].generatedImageUrl ? (
                             <div className="relative w-full h-full">
                                <img 
                                    src={state.slides[activeSlideIndex].generatedImageUrl} 
                                    className="w-full h-full object-cover cursor-zoom-in"
                                    onClick={() => setShowLargePreview(true)}
                                    alt="Slide Preview"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                             </div>
                        ) : state.slides[activeSlideIndex].isGenerating ? (
                            // Skeleton Loading State
                            <div className="w-full h-full p-16 flex flex-col bg-white animate-pulse">
                                {/* Header Skeleton */}
                                <div className="h-12 bg-paper-200 w-2/5 rounded-lg mb-16"></div>
                                
                                {/* Content Body Skeleton */}
                                <div className="flex flex-1 gap-16">
                                    {/* Left Text Column */}
                                    <div className="flex-1 space-y-8">
                                        <div className="h-5 bg-paper-200 rounded w-full"></div>
                                        <div className="h-5 bg-paper-200 rounded w-11/12"></div>
                                        <div className="h-5 bg-paper-200 rounded w-10/12"></div>
                                        <div className="space-y-4 pt-8">
                                            <div className="h-4 bg-paper-100 rounded w-full"></div>
                                            <div className="h-4 bg-paper-100 rounded w-full"></div>
                                            <div className="h-4 bg-paper-100 rounded w-3/4"></div>
                                        </div>
                                    </div>
                                    {/* Right Visual Column */}
                                    <div className="flex-1 bg-paper-100 rounded-xl h-full border border-paper-200"></div>
                                </div>

                                {/* Floating Status Indicator */}
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                     <div className="bg-white/80 backdrop-blur-md px-8 py-4 rounded-full shadow-2xl border border-white/50 flex items-center gap-4">
                                         <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                                         <span className="text-ink font-medium text-sm tracking-wide">AI 正在绘制设计...</span>
                                     </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-ink-light bg-paper-50">
                                <div className="text-center space-y-4">
                                    <div className="w-16 h-16 bg-paper-200 rounded-full flex items-center justify-center mx-auto text-paper-400">
                                        <IconImage className="w-8 h-8" />
                                    </div>
                                    <p className="text-lg font-medium text-ink-light">点击上方“重新生成”以创建幻灯片</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Properties Panel */}
                <div className="h-72 bg-white border-t border-paper-300 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-paper-300 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)] z-20">
                    {/* Column 1: Text Content */}
                    <div className="p-6 flex flex-col gap-3 hover:bg-paper-50 transition-colors">
                        <label className="text-xs font-bold text-ink-light uppercase tracking-widest flex items-center gap-2">
                            <IconEdit className="w-3 h-3 text-accent" /> 文字内容
                        </label>
                        <textarea 
                            className="flex-1 w-full bg-paper-50 border border-paper-200 rounded-lg p-3 text-sm resize-none focus:ring-1 focus:ring-accent focus:bg-white outline-none transition-all"
                            value={state.slides[activeSlideIndex].content}
                            onChange={(e) => handleUpdateSlide(state.slides[activeSlideIndex].id, 'content', e.target.value)}
                        />
                    </div>
                    
                    {/* Column 2: Prompt */}
                    <div className="p-6 flex flex-col gap-3 hover:bg-paper-50 transition-colors">
                         <label className="text-xs font-bold text-ink-light uppercase tracking-widest flex items-center gap-2">
                            <IconImage className="w-3 h-3 text-accent" /> 视觉指令 (Prompt)
                        </label>
                        <textarea 
                            className="flex-1 w-full bg-paper-50 border border-paper-200 rounded-lg p-3 text-sm font-mono text-ink-light resize-none focus:ring-1 focus:ring-accent focus:bg-white outline-none transition-all"
                            value={state.slides[activeSlideIndex].visualDescription}
                            onChange={(e) => handleUpdateSlide(state.slides[activeSlideIndex].id, 'visualDescription', e.target.value)}
                        />
                    </div>

                    {/* Column 3: Adjustments */}
                    <div className="p-6 flex flex-col gap-3 bg-accent-subtle/20 hover:bg-accent-subtle/30 transition-colors">
                        <label className="text-xs font-bold text-accent uppercase tracking-widest flex items-center gap-2">
                            <IconSparkles className="w-3 h-3" /> 调整指令
                        </label>
                         <p className="text-[11px] text-ink-light/80 leading-tight">如果不满意，请在此输入调整意见（如：背景太亮、字体颜色不对），然后点击重新生成。</p>
                        <textarea 
                            className="flex-1 w-full bg-white border border-accent/10 rounded-lg p-3 text-sm resize-none focus:ring-1 focus:ring-accent outline-none placeholder-ink-faint/50 text-ink"
                            placeholder="例如：把背景改成深色，图表用柱状图..."
                            value={state.slides[activeSlideIndex].userPromptOverride || ''}
                            onChange={(e) => handleUpdateSlide(state.slides[activeSlideIndex].id, 'userPromptOverride', e.target.value)}
                        />
                    </div>
                </div>
                </>
            )}
        </main>

        {/* Modal: Global Style Adjustment */}
        {isStyleModalOpen && (
            <div className="fixed inset-0 z-50 bg-ink/20 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col border border-white/50 ring-1 ring-black/5 transform transition-all scale-100">
                    <div className="px-8 py-6 border-b border-paper-200 flex justify-between items-center bg-paper-50/50">
                        <h3 className="font-serif font-bold text-ink text-xl flex items-center gap-3">
                            <IconPalette className="w-5 h-5 text-accent" />
                            调整全局设计风格
                        </h3>
                        <button onClick={() => setStyleModalOpen(false)} className="text-ink-light hover:text-ink p-1 rounded-full hover:bg-paper-200 transition-colors">
                            <IconClose className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-8 space-y-6">
                        <p className="text-base text-ink-light leading-relaxed">
                            在此输入您对整体幻灯片风格的修改意见。AI 将会更新全局设计系统。更新后，请重新生成各个页面以查看效果。
                        </p>
                        <textarea 
                            className="w-full h-40 bg-paper-50 border border-paper-300 rounded-xl p-4 text-base resize-none focus:ring-2 focus:ring-accent focus:bg-white outline-none transition-all placeholder:text-ink-faint"
                            placeholder="例如：整体色调太冷了，想要更温暖一点。标题字体加粗，背景增加一些几何纹理..."
                            value={styleAdjustment}
                            onChange={(e) => setStyleAdjustment(e.target.value)}
                        />
                    </div>
                    <div className="px-8 py-6 bg-paper-50 border-t border-paper-200 flex justify-end gap-4">
                        <Button variant="ghost" onClick={() => setStyleModalOpen(false)} className="px-6">取消</Button>
                        <Button 
                            variant="primary" 
                            onClick={handleUpdateGlobalStyle}
                            isLoading={isUpdatingStyle}
                            disabled={!styleAdjustment.trim() || isUpdatingStyle}
                            className="px-6 py-3"
                        >
                            更新并应用到所有幻灯片
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal: Large Preview */}
        {showLargePreview && state.slides[activeSlideIndex]?.generatedImageUrl && (
            <div className="fixed inset-0 z-50 bg-paper-100/95 flex items-center justify-center p-8 backdrop-blur-md" onClick={() => setShowLargePreview(false)}>
                <img 
                    src={state.slides[activeSlideIndex].generatedImageUrl} 
                    className="max-w-[95vw] max-h-[95vh] shadow-2xl rounded-sm ring-1 ring-black/10"
                    alt="Full Preview"
                />
                <button className="absolute top-6 right-6 text-ink-light hover:text-ink p-2 rounded-full hover:bg-white/50 transition-colors">
                   <IconClose className="w-8 h-8" />
                </button>
            </div>
        )}
    </div>
  );
};

export default App;