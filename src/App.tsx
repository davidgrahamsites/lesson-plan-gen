import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Calendar,
  Gamepad2,
  Settings,
  Send,
  Upload,
  Terminal,
  Sparkles,
  ChevronRight,
  Download,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { MindMapParser, GamesListParser, TemplateProcessor, CalendarTableParser, SpiralReviewParser, GetSpiralReviewItems } from './lib/parsers';
import { OCRProcessor, AdvancedLessonPlanSynthesizer } from './lib/ai';
import { saveAs } from 'file-saver';
import { saveAppState, loadAppState, listSets, saveSetMetadata } from './lib/storage';
import { Layers, Save, FolderOpen } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'system' | 'ai';
  timestamp: Date;
  previewText?: string;
  attachment?: {
    blob: Blob;
    filename: string;
    extension: string;
  };
  generatedAt?: string;
}

interface FileState {
  mindMap: { data: Record<string, string>, date: string } | null;
  calendar: { data: Record<string, { subject: string, content: string, game: string }>, song: string, week?: string } | null;
  gamesList: Record<string, string> | null;
  spiralReview: string[] | null;
  template: ArrayBuffer | null;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your Lesson Plan Assistant. Upload your Mind Map (TXT), Calendar (Image/Doc), Games List (TXT), and Template (DOCX) to get started.",
      sender: 'system',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [files, setFiles] = useState<FileState>({
    mindMap: null,
    calendar: null,
    gamesList: null,
    spiralReview: null,
    template: null
  });

  const [config, setConfig] = useState({
    provider: 'openai' as 'openai' | 'gemini',
    apiKey: '',
    teacherName: 'Daniel',
    className: 'PK2'
  });

  const [spiralIndex, setSpiralIndex] = useState(0);
  const [savedSetNames, setSavedSetNames] = useState<string[]>([]);
  const [activeSetName, setActiveSetName] = useState<string>('Default');
  const [setNameInput, setSetNameInput] = useState('');
  const [showSetsModal, setShowSetsModal] = useState(false);

  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const isHydrated = useRef(false);

  // Load state on mount
  useEffect(() => {
    const initPersistence = async () => {
      const savedFiles = await loadAppState('app_files');
      if (savedFiles) {
        // Migration: Check if mindMap is in old format (direct object vs {data, date})
        if (savedFiles.mindMap && !savedFiles.mindMap.data) {
          console.log("Migrating legacy MindMap state...");
          savedFiles.mindMap = {
            data: savedFiles.mindMap,
            date: '' // Default or empty if we can't re-parse easily without the file
          };
        }
        // Migration: Check if calendar is in old format (direct object vs {data, song})
        if (savedFiles.calendar && !savedFiles.calendar.data) {
          console.log("Migrating legacy Calendar state...");
          savedFiles.calendar = {
            data: savedFiles.calendar,
            song: "Song of the Week",
            week: ""
          };
        }
        setFiles(savedFiles);
      }

      const savedConfig = await loadAppState('app_config');
      if (savedConfig) setConfig(savedConfig);

      const savedSpiralIndex = await loadAppState('app_spiral_index');
      if (savedSpiralIndex !== null) setSpiralIndex(savedSpiralIndex);

      const savedMessages = await loadAppState('app_messages');
      if (savedMessages) setMessages(savedMessages);

      const sets = await listSets();
      setSavedSetNames(sets);

      isHydrated.current = true;
    };
    initPersistence();
  }, []);

  // Persist state changes
  useEffect(() => {
    if (!isHydrated.current) return;
    saveAppState('app_files', files);
  }, [files]);

  useEffect(() => {
    if (!isHydrated.current) return;
    saveAppState('app_config', config);
  }, [config]);

  useEffect(() => {
    if (!isHydrated.current) return;
    saveAppState('app_spiral_index', spiralIndex);
  }, [spiralIndex]);

  useEffect(() => {
    if (!isHydrated.current) return;
    saveAppState('app_messages', messages);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSaveSet = async () => {
    if (!setNameInput.trim()) return;
    const name = setNameInput.trim();

    // Save current data bundle
    const bundle = { files, spiralIndex, messages };
    await saveAppState(`docset_DATA_${name}`, bundle);

    const newSets = Array.from(new Set([...savedSetNames, name]));
    setSavedSetNames(newSets);
    await saveSetMetadata(newSets);
    setActiveSetName(name);
    setSetNameInput('');
    setShowSetsModal(false);

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: `Document set "${name}" saved successfully.`,
      sender: 'system',
      timestamp: new Date()
    }]);
  };

  const handleLoadSet = async (name: string) => {
    const bundle = await loadAppState(`docset_DATA_${name}`);
    if (bundle) {
      setFiles(bundle.files);
      setSpiralIndex(bundle.spiralIndex);
      setMessages(bundle.messages);
      setActiveSetName(name);
      setShowSetsModal(false);

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Switched to document set: ${name}`,
        sender: 'system',
        timestamp: new Date()
      }]);
    }
  };

  const handleFileUpload = async (type: keyof FileState, file: File) => {
    try {
      if (type === 'template') {
        const buffer = await file.arrayBuffer();
        setFiles(prev => ({ ...prev, template: buffer }));
      } else if (type === 'mindMap') {
        const text = await file.text();
        const parsed = MindMapParser(text);
        setFiles(prev => ({ ...prev, mindMap: parsed }));
      } else if (type === 'gamesList') {
        const text = await file.text();
        setFiles(prev => ({ ...prev, gamesList: GamesListParser(text) }));
      } else if (type === 'spiralReview') {
        const text = await file.text();
        setFiles(prev => ({ ...prev, spiralReview: SpiralReviewParser(text) }));
      } else if (type === 'calendar') {
        const ocrData = await OCRProcessor(file);
        const parsed = CalendarTableParser(ocrData);
        setFiles(prev => ({ ...prev, calendar: parsed }));
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Successfully loaded ${file.name} for ${type}`,
        sender: 'system',
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Error loading ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sender: 'system',
        timestamp: new Date()
      }]);
    }
  };

  const generateLessonPlan = async (query: string) => {
    if (!files.mindMap || !files.gamesList || !files.template || !files.calendar || !files.spiralReview) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Please upload all required files (Mind Map, Calendar, Games List, Spiral Review, and Template) before generating.",
        sender: 'system',
        timestamp: new Date()
      }]);
      return;
    }

    if (!config.apiKey) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Please set your API Key in Settings first.",
        sender: 'system',
        timestamp: new Date()
      }]);
      setConfigOpen(true);
      return;
    }

    const targetDay = query.toLowerCase().match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/)?.[0] || 'monday';
    const dayData = files.calendar.data[targetDay];

    if (!dayData) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Could not find schedule data for ${targetDay} in the uploaded calendar.`,
        sender: 'system',
        timestamp: new Date()
      }]);
      return;
    }

    const displaySubject = dayData.subject.length > 30 ? dayData.subject.slice(0, 30) + '...' : dayData.subject;

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: `Generating: ${files.calendar.week ? files.calendar.week + ' ' : ''}${targetDay.toUpperCase()} - ${displaySubject}...`,
      sender: 'ai',
      timestamp: new Date()
    }]);

    try {
      // 1. Get targets: Use Week info if available + Day to find exact match
      // If week is known (e.g. "WEEK 3"), prioritize keys starting with that.
      const currentWeekLabel = files.calendar.week?.toLowerCase() || "";

      const mindMapMatch = Object.entries(files.mindMap.data).find(([key, _]) => {
        const lowerKey = key.toLowerCase();
        // Strict Week Match: If we have a week, key MUST match it.
        if (currentWeekLabel && !lowerKey.includes(currentWeekLabel)) return false;
        return lowerKey.includes(targetDay);
      });

      // Fallback: If strict match fails, try relaxing (e.g. content match) - but be careful.
      // For now, let's stick to the found match or a generic fallback.
      const targets = mindMapMatch?.[1] || "Learning targets for " + dayData.content;

      // 2. Identify the Game from Games List
      const messyGameText = dayData.game.toLowerCase();

      // FUZZY WORD SET MATCH: Split by spaces and count overlaps
      const findFuzzyGame = () => {
        const messyWords = new Set(messyGameText.split(/\s+/).filter(w => w.length >= 3));
        let bestMatch = "";
        let maxOverlap = 0;

        Object.keys(files.gamesList).forEach(name => {
          const cleanWords = name.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
          const overlap = cleanWords.filter(w => messyWords.has(w)).length;
          if (overlap > maxOverlap && overlap >= 1) {
            maxOverlap = overlap;
            bestMatch = name;
          }
        });
        return bestMatch;
      };

      const gameMatch = findFuzzyGame();

      // LOOSER MATCH: Try fuzzy match, then clean OCR text.
      const cleanGameName = gameMatch || dayData.game.replace(/practice\s*week\s*\d*/gi, '').replace(/small\s*group/gi, '').trim();
      const genericDesc = gameMatch ? files.gamesList[gameMatch] : "Educational game based on curriculum targets.";

      // 3. Get Spiral Review Sentences
      const review = GetSpiralReviewItems(files.spiralReview, spiralIndex);
      setSpiralIndex(review.nextIndex);

      const weekLabel = files.calendar.week || (mindMapMatch?.[0].match(/week\s*\d+/i)?.[0].toUpperCase() || "WEEK");

      // 4. Advanced AI Synthesis
      const synthData = await AdvancedLessonPlanSynthesizer(
        {
          day: targetDay.toUpperCase(),
          subject: dayData.subject,
          targets: targets,
          gameName: cleanGameName,
          gameDescription: genericDesc,
          spiralReview: { oldest: review.oldest || 'N/A', recent: review.recent || 'N/A' },
          song: files.calendar.song,
          teacherName: config.teacherName,
          className: config.className
        },
        config.provider,
        config.apiKey
      );

      // 5. Process Template with expanded fields
      const result = await TemplateProcessor(files.template, {
        // Human-friendly keys (for .txt templates)
        'Activity Name': synthData.activityName,
        'Class': config.className,
        'Teacher Name': config.teacherName,
        "Teacher's Name": config.teacherName,
        'Date': files.mindMap.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        'Objectives': synthData.objectives,
        'Materials': synthData.materials,
        'Introductions': synthData.introduction,
        'Activity': synthData.activity,
        'Game': synthData.game,
        'Closure': synthData.closure,

        // Dashed versions (as seen in user's list)
        '-Introductions': synthData.introduction,
        '-Activity': synthData.activity,
        '-Game': synthData.game,
        '-Closure': synthData.closure,

        // Uppercase keys (traditional)
        'ACTIVITY_NAME': synthData.activityName,
        'CLASS': config.className,
        'TEACHER': config.teacherName,
        'DATE': new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        'DAY': targetDay.toUpperCase(),
        'SUBJECT': dayData.subject,
        'OBJECTIVES': synthData.objectives,
        'MATERIALS': synthData.materials,
        'INTRODUCTIONS': synthData.introduction,
        'ACTIVITY': synthData.activity,
        'GAME': synthData.game,
        'CLOSURE': synthData.closure,
        'REVIEW_OLDEST': review.oldest || "N/A",
        'REVIEW_RECENT': review.recent || "N/A"
      });

      const displayFilename = `PK2_${weekLabel.replace(/\s+/g, '_')}_${targetDay.toUpperCase()}_Lesson_Plan`;

      // 6. Construct Preview Text (Full version) - NO BOLDING
      const previewText = `${synthData.activityName}\n\n` +
        `Class: ${config.className} | Teacher: ${config.teacherName}\n` +
        `Objectives:\n${synthData.objectives}\n\n` +
        `Materials:\n${synthData.materials}\n\n` +
        `Process:\n` +
        `Introduction: ${synthData.introduction}\n\n` +
        `Activity: ${synthData.activity}\n\n` +
        `Game: ${synthData.game}\n\n` +
        `Closure: ${synthData.closure}`;

      const timestampStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Success! Generated ${displayFilename}.${result.extension}`,
        sender: 'ai',
        previewText: previewText,
        generatedAt: timestampStr,
        attachment: {
          blob: result.blob,
          filename: displayFilename,
          extension: result.extension
        },
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Synthesis failed: ${error instanceof Error ? error.message : 'AI error'}`,
        sender: 'system',
        timestamp: new Date()
      }]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setPendingImage(event.target?.result as string);
            setPendingFile(file);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !pendingFile) return;

    const userText = inputValue;
    const currentPendingFile = pendingFile;

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: userText || "Pasted Image",
      sender: 'user',
      timestamp: new Date()
    }]);

    setInputValue('');
    setPendingImage(null);
    setPendingFile(null);

    if (currentPendingFile) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "OCR-ing pasted image...",
        sender: 'system',
        timestamp: new Date()
      }]);
      const ocrData = await OCRProcessor(currentPendingFile);
      setFiles(prev => ({ ...prev, calendar: CalendarTableParser(ocrData) }));

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: "Pasted calendar processed. You can now type 'Generate' for a specific day.",
        sender: 'system',
        timestamp: new Date()
      }]);
    } else if (userText.toLowerCase().includes('generate')) {
      generateLessonPlan(userText);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans antialiased text-foreground">
      <aside className="w-20 lg:w-64 border-r border-white/10 flex flex-col p-4 bg-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-xl hidden lg:block bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            LessonGen
          </h1>
        </div>

        <nav className="flex-1 space-y-2">
          <button className="flex items-center gap-3 w-full p-3 rounded-xl bg-primary/10 text-primary border border-primary/20 transition-all hover:bg-primary/20">
            <Terminal className="w-5 h-5" />
            <span className="hidden lg:block font-medium">Console</span>
          </button>
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-white/60 transition-all"
          >
            <Settings className="w-5 h-5" />
            <span className="hidden lg:block font-medium">Settings</span>
          </button>

          <button
            onClick={() => setShowSetsModal(true)}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-white/60 transition-all group"
          >
            <Layers className="w-5 h-5 group-hover:text-primary transition-colors" />
            <div className="hidden lg:block text-left flex-1">
              <span className="font-medium">Doc Sets</span>
              <p className="text-[10px] text-white/20 truncate">{activeSetName}</p>
            </div>
          </button>

          <div className="pt-4 border-t border-white/10 space-y-4 hidden lg:block">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest pl-1">Identity</label>
              <div className="space-y-2">
                <div className="relative group/input">
                  <div className="absolute inset-y-0 left-3 flex items-center text-white/20 group-focus-within/input:text-primary transition-colors">
                    <span className="text-[10px] font-bold">T</span>
                  </div>
                  <input
                    type="text"
                    value={config.teacherName}
                    onChange={(e) => setConfig({ ...config, teacherName: e.target.value })}
                    placeholder="Teacher Name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div className="relative group/input">
                  <div className="absolute inset-y-0 left-3 flex items-center text-white/20 group-focus-within/input:text-primary transition-colors">
                    <span className="text-[10px] font-bold">C</span>
                  </div>
                  <input
                    type="text"
                    value={config.className}
                    onChange={(e) => setConfig({ ...config, className: e.target.value })}
                    placeholder="Class Name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </nav>

        <div className="mt-auto p-4 glass-card lg:block hidden">
          <p className="text-xs text-white/40 mb-2">System Status</p>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Ready
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-24 border-b border-white/10 flex items-center px-8 gap-6 overflow-x-auto scrollbar-hide bg-white/5 backdrop-blur-sm">
          <FileSlot
            icon={<FileText className="w-4 h-4" />}
            label="Mind Map"
            status={files.mindMap ? 'Loaded' : 'Empty'}
            onUpload={(f) => handleFileUpload('mindMap', f)}
          />
          <FileSlot
            icon={<Calendar className="w-4 h-4" />}
            label="Calendar"
            status={files.calendar ? 'Loaded' : 'Empty'}
            onUpload={(f) => handleFileUpload('calendar', f)}
          />
          <FileSlot
            icon={<Gamepad2 className="w-4 h-4" />}
            label="Games List"
            status={files.gamesList ? 'Loaded' : 'Empty'}
            onUpload={(f) => handleFileUpload('gamesList', f)}
          />
          <FileSlot
            icon={<Sparkles className="w-4 h-4" />}
            label="Spiral Review"
            status={files.spiralReview ? 'Loaded' : 'Empty'}
            onUpload={(f) => handleFileUpload('spiralReview', f)}
          />
          <FileSlot
            icon={<Upload className="w-4 h-4" />}
            label="Template"
            status={files.template ? 'Loaded' : 'Empty'}
            onUpload={(f) => handleFileUpload('template', f)}
          />
        </header>

        <div className="flex-1 flex flex-col p-8 overflow-hidden">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-6 pr-4 mb-4 scrollbar-thin scrollbar-thumb-white/10"
          >
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={cn(
                    "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                    msg.sender === 'user'
                      ? "ml-auto bg-primary text-white shadow-lg shadow-primary/10"
                      : msg.sender === 'ai'
                        ? "bg-purple-500/10 border border-purple-500/20 text-purple-200"
                        : "bg-white/5 border border-white/10 text-white/90 backdrop-blur-sm"
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.previewText || msg.text}</div>

                  {msg.attachment && (
                    <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
                      <button
                        onClick={() => saveAs(msg.attachment!.blob, `${msg.attachment!.filename}.${msg.attachment!.extension}`)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-all text-xs font-medium"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download .{msg.attachment.extension}
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.previewText || msg.text);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-all text-xs font-medium"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy Text
                      </button>
                    </div>
                  )}
                  {msg.generatedAt && (
                    <div className="mt-2 text-[10px] text-white/20 text-right italic">
                      Generated at {msg.generatedAt}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="relative group">
            {pendingImage && (
              <div className="absolute bottom-full mb-4 left-0 p-2 glass-card animate-in fade-in slide-in-from-bottom-4">
                <img src={pendingImage} alt="Pending" className="max-h-32 rounded-lg" />
                <button
                  onClick={() => { setPendingImage(null); setPendingFile(null); }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >&times;</button>
              </div>
            )}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500" />
            <div className="relative flex items-center glass-card p-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                onPaste={handlePaste}
                placeholder="Type 'Generate...' or paste an image"
                className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-2 text-white placeholder:text-white/20"
              />
              <button
                onClick={handleSendMessage}
                className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white hover:opacity-90 active:scale-95 transition-all"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {configOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md glass-card p-8 space-y-6"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold">Settings</h2>
                <button onClick={() => setConfigOpen(false)} className="text-white/40 hover:text-white text-2xl">&times;</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/40 uppercase mb-2">Teacher Name</label>
                  <input
                    type="text"
                    value={config.teacherName}
                    onChange={(e) => setConfig({ ...config, teacherName: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    placeholder="Enter teacher name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/40 uppercase mb-2">Class Name</label>
                  <input
                    type="text"
                    value={config.className}
                    onChange={(e) => setConfig({ ...config, className: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    placeholder="Enter class name (e.g., PK2)"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-white/40 uppercase tracking-wider">AI Provider</label>
                  <select
                    value={config.provider}
                    onChange={(e) => setConfig(prev => ({ ...prev, provider: e.target.value as 'openai' | 'gemini' }))}
                    className="w-full glass-input bg-white/5"
                  >
                    <option value="openai">OpenAI (GPT-4o-mini)</option>
                    <option value="gemini">Google (Gemini 1.5 Flash)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-white/40 uppercase tracking-wider">API Key</label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full glass-input text-white"
                  />
                </div>
              </div>
              <button onClick={() => setConfigOpen(false)} className="w-full btn-primary mt-4">Save Configuration</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSetsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md glass-card p-8 space-y-6"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold">Document Sets</h2>
                <button onClick={() => setShowSetsModal(false)} className="text-white/40 hover:text-white text-2xl">&times;</button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Save Current Group As</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={setNameInput}
                      onChange={(e) => setSetNameInput(e.target.value)}
                      placeholder="e.g. January 2026"
                      className="flex-1 glass-input text-white text-sm"
                    />
                    <button
                      onClick={handleSaveSet}
                      className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white hover:opacity-90 active:scale-95 transition-all"
                    >
                      <Save className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Loaded Sets</label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                    {savedSetNames.map(name => (
                      <button
                        key={name}
                        onClick={() => handleLoadSet(name)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                          activeSetName === name
                            ? "bg-primary/20 border-primary/40 text-white"
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <FolderOpen className={cn("w-4 h-4", activeSetName === name ? "text-primary" : "text-white/20")} />
                          <span className="text-sm font-medium">{name}</span>
                        </div>
                        {activeSetName === name && (
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </button>
                    ))}
                    {savedSetNames.length === 0 && (
                      <p className="text-center py-4 text-xs text-white/20 italic">No saved sets found.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface FileSlotProps {
  icon: React.ReactNode;
  label: string;
  status: 'Empty' | 'Loaded' | 'Parsing';
  onUpload: (file: File) => void;
}

const FileSlot: React.FC<FileSlotProps> = ({ icon, label, status, onUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      className="flex items-center gap-3 glass-card px-4 py-3 min-w-[180px] group cursor-pointer hover:border-primary/30 transition-all"
    >
      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
      />
      <div className={cn(
        "p-2 rounded-lg transition-colors",
        status === 'Loaded' ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/40 group-hover:bg-white/10"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{label}</p>
        <p className={cn(
          "text-[10px] uppercase tracking-tighter font-bold",
          status === 'Loaded' ? "text-emerald-400/60" : "text-white/20"
        )}>{status}</p>
      </div>
      <ChevronRight className="w-3 h-3 text-white/10 group-hover:text-white/40 transition-colors" />
    </div>
  );
};

export default App;
