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
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { MindMapParser, GamesListParser, TemplateProcessor } from './lib/parsers';
import { AISynthesizer, OCRProcessor } from './lib/ai';
import { saveAs } from 'file-saver';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'system' | 'ai';
  timestamp: Date;
}

interface FileState {
  mindMap: Record<string, string> | null;
  calendar: string | null;
  gamesList: Record<string, string> | null;
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
    template: null
  });

  const [config, setConfig] = useState({
    provider: 'openai' as 'openai' | 'gemini',
    apiKey: ''
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFileUpload = async (type: keyof FileState, file: File) => {
    try {
      if (type === 'template') {
        const buffer = await file.arrayBuffer();
        setFiles(prev => ({ ...prev, template: buffer }));
      } else if (type === 'mindMap') {
        const text = await file.text();
        setFiles(prev => ({ ...prev, mindMap: MindMapParser(text) }));
      } else if (type === 'gamesList') {
        const text = await file.text();
        setFiles(prev => ({ ...prev, gamesList: GamesListParser(text) }));
      } else if (type === 'calendar') {
        const text = await OCRProcessor(file);
        setFiles(prev => ({ ...prev, calendar: text }));
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
    if (!files.mindMap || !files.gamesList || !files.template || !files.calendar) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Please upload all required files (Mind Map, Calendar, Games List, and Template) before generating.",
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

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: `Generating lesson plan for ${targetDay}...`,
      sender: 'ai',
      timestamp: new Date()
    }]);

    try {
      const targets = files.mindMap[`week 1 ${targetDay}`] || "General Learning Targets";
      const gameName = "The Target Game"; // Extraction logic would go here
      const genericDesc = files.gamesList[gameName.toLowerCase()] || "Play a game about [topic]";

      const finalGameDesc = await AISynthesizer(genericDesc, targets, config.provider, config.apiKey);

      const finalDoc = await TemplateProcessor(files.template, {
        'DAY': targetDay.toUpperCase(),
        'TARGETS': targets,
        'GAME_DESCRIPTION': finalGameDesc
      });

      saveAs(finalDoc, `Lesson_Plan_${targetDay}.docx`);

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Done! Your lesson plan for ${targetDay} has been generated and downloaded.`,
        sender: 'system',
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

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    }]);

    if (inputValue.toLowerCase().includes('generate')) {
      generateLessonPlan(inputValue);
    }

    setInputValue('');
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
                  {msg.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500" />
            <div className="relative flex items-center glass-card p-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type 'Generate Monday lesson plan'..."
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
