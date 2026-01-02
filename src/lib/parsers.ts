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
    const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const calendarData: Record<string, { subject: string, content: string, game: string }> = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Find a line that looks like a header (contains multiple day names)
    const headerLineIndex = lines.findIndex(line => {
        const lowerLine = line.toLowerCase();
        return days.filter(d => lowerLine.includes(d)).length >= 2;
    });

    if (headerLineIndex !== -1) {
        // COLUMN-BASED TABLE detected
        const headerLine = lines[headerLineIndex];
        const contentLine = lines[headerLineIndex + 1] || "";
        const lowerHeader = headerLine.toLowerCase();

        days.forEach(day => {
            const start = lowerHeader.indexOf(day);
            if (start !== -1) {
                // Find where the next day starts to segment the header and content
                const otherDayStarts = days
                    .map(d => lowerHeader.indexOf(d))
                    .filter(idx => idx > start)
                    .sort((a, b) => a - b);

                const end = otherDayStarts[0] || headerLine.length;

                // Segment the header (subject) and content
                const subject = headerLine.slice(start, end).replace(new RegExp(day, 'i'), '').trim();

                // Map the content line relative to the header positions
                // This is a rough heuristic but better than before
                const content = contentLine.slice(start, end).trim();

                calendarData[day] = {
                    subject: subject || "No Subject",
                    content: content || "No Content",
                    game: content // Game name is usually in the content
                };
            }
        });
    } else {
        // ROW-BASED or messy OCR
        days.forEach(day => {
            const dayIndex = lines.findIndex(l => l.toLowerCase().includes(day));
            if (dayIndex !== -1) {
                const subject = lines[dayIndex].replace(new RegExp(day, 'i'), '').trim() || lines[dayIndex + 1] || "General";
                const row2Text = lines.slice(dayIndex + 1, dayIndex + 4).join(' ');
                calendarData[day] = {
                    subject,
                    content: row2Text,
                    game: row2Text
                };
            }
        });
    }

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
