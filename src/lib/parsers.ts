import mammoth from 'mammoth';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export const MindMapParser = (content: string) => {
    // Mind map is expected to be a TXT file with 4 weeks of content.
    // We'll parse it into a structured object indexed by Week/Day.
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const data: Record<string, string> = {};

    let currentWeek = '';
    lines.forEach(line => {
        if (line.toLowerCase().includes('week')) {
            currentWeek = line.trim();
        } else if (currentWeek && line.includes(':')) {
            const [day, target] = line.split(':').map(s => s.trim());
            data[`${currentWeek} ${day}`.toLowerCase()] = target;
        }
    });

    return data;
};

export const GamesListParser = (content: string) => {
    // Games list is TXT. Format: "Game Name: Description with [Placeholders]"
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const games: Record<string, string> = {};

    lines.forEach(line => {
        if (line.includes(':')) {
            const [name, desc] = line.split(':').map(s => s.trim());
            games[name.toLowerCase()] = desc;
        }
    });

    return games;
};

export const CalendarTableParser = (ocrText: string) => {
    // User describes:
    // Row 1: Days/Subject
    // Row 2: General Content + Game Name

    const lines = ocrText.split('\n').filter(l => l.trim().length > 3);
    const calendarData: Record<string, { subject: string, content: string, game: string }> = {};

    // OCR usually outputs text in a way that rows are sequential or columns are sequential.
    // We'll look for Day keywords (Monday, etc.) to segment.
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Simple heuristic: If we find a line with a day name, assume it's part of the header.
    // This is a difficult problem without LLM-based layout detection, 
    // but we'll try a flexible keyword search.

    days.forEach(day => {
        const dayIndex = lines.findIndex(l => l.toLowerCase().includes(day));
        if (dayIndex !== -1) {
            // Heuristic: Subject is often on the same line or next line
            const subject = lines[dayIndex].replace(new RegExp(day, 'i'), '').trim() || lines[dayIndex + 1] || "";

            // Row 2 logic: Search for content/games in subsequent lines until next day
            // For now, we'll take the next available non-empty lines
            const row2Text = lines.slice(dayIndex + 2, dayIndex + 5).join(' ');

            calendarData[day] = {
                subject,
                content: row2Text, // This will be used to match Mind Map targets
                game: row2Text     // This will be parsed for Game Names
            };
        }
    });

    return calendarData;
};

export const SpiralReviewParser = (content: string) => {
    // Parser for the Spiral Review list. 
    // Bottom of the list is oldest, top is newest.
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return lines; // Just return the array of sentences
};

/**
 * Selection Algorithm: 
 * - Increments from bottom (oldest) to top.
 * - Spaced repetition pulls more frequently from top.
 */
export const GetSpiralReviewItems = (list: string[], currentIndex: number) => {
    if (list.length === 0) return { sentence: "No review items available.", nextIndex: 0 };

    // Requirement: Increment from bottom to top (oldest to newest)
    // Let's assume 'currentIndex' tracks the progress from the bottom (index list.length - 1 down to 0)
    const bottomIndex = list.length - 1 - (currentIndex % list.length);
    const oldestSentence = list[bottomIndex];

    // Requirement: Pull MORE frequently from top (newest)
    // We'll also pick a "recent" sentence (from the top 20% of the list)
    const topCount = Math.ceil(list.length * 0.2);
    const recentIndex = Math.floor(Math.random() * topCount);
    const recentSentence = list[recentIndex];

    return {
        oldest: oldestSentence,
        recent: recentSentence,
        nextIndex: currentIndex + 1
    };
};

export const TemplateProcessor = async (arrayBuffer: ArrayBuffer, data: Record<string, string>) => {
    // Simple template replacement for DOCX using a ZIP/XML approach
    // In a real app, libraries like docxtemplater are better, 
    // but we'll implement a clean version using JSZip for direct control.
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file("word/document.xml")?.async("string");

    if (!docXml) throw new Error("Invalid DOCX: missing document.xml");

    let newXml = docXml;
    Object.entries(data).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        newXml = newXml.replaceAll(placeholder, value);
    });

    zip.file("word/document.xml", newXml);
    const blob = await zip.generateAsync({ type: "blob" });
    return blob;
};
