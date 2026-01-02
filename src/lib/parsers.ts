import JSZip from 'jszip';

export const MindMapParser = (content: string) => {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const data: Record<string, string> = {};
    let extractedDate = '';

    // Simple regex to find month + day (e.g., January 15)
    const dateMatch = content.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+/i);
    if (dateMatch) extractedDate = dateMatch[0];

    let currentWeek = '';
    lines.forEach(line => {
        if (line.toLowerCase().includes('week')) {
            currentWeek = line.trim();
        } else if (currentWeek && line.includes(':')) {
            const [day, target] = line.split(':').map(s => s.trim());
            data[`${currentWeek} ${day}`.toLowerCase()] = target;
        }
    });

    return { data, date: extractedDate };
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
    let extractedSong = "Song of the Week"; // Default

    // Heuristic: Look for "Song" or "Sing" in the FIRST 5 lines (usually header info)
    const songLine = lines.slice(0, 10).find(l => l.toLowerCase().includes('song') || l.toLowerCase().includes('sing'));
    if (songLine) {
        // Clean up: remove "Song:" prefix if present
        extractedSong = songLine.replace(/song\s*:?/i, '').replace(/sing\s*:?/i, '').trim() || songLine;
    }

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

    return { data: calendarData, song: extractedSong };
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

export const TemplateProcessor = async (arrayBuffer: ArrayBuffer | null, data: Record<string, string>) => {
    if (!arrayBuffer) throw new Error("Template buffer is missing.");

    // Check if it's a ZIP/DOCX by looking for 'PK' header (50 4B)
    const view = new Uint8Array(arrayBuffer);
    const isZip = view[0] === 0x50 && view[1] === 0x4B;

    if (!isZip) {
        // Fallback for TXT templates
        try {
            const decoder = new TextDecoder();
            let text = decoder.decode(arrayBuffer);
            Object.entries(data).forEach(([key, value]) => {
                const placeholder = `{{${key}}}`;
                text = text.replaceAll(placeholder, value);
            });
            return {
                blob: new Blob([text], { type: 'text/plain' }),
                extension: 'txt'
            };
        } catch (e) {
            throw new Error("Template is not a valid DOCX or Text file.");
        }
    }

    try {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const docXmlFile = zip.file("word/document.xml");
        if (!docXmlFile) throw new Error("Invalid DOCX: missing word/document.xml. Please ensure this is a standard .docx file and not a .doc or renamed file.");

        const docXml = await docXmlFile.async("string");
        let newXml = docXml;
        Object.entries(data).forEach(([key, value]) => {
            const placeholder = `{{${key}}}`;
            newXml = newXml.replaceAll(placeholder, value);
        });

        zip.file("word/document.xml", newXml);
        const blob = await zip.generateAsync({ type: "blob" });
        return {
            blob,
            extension: 'docx'
        };
    } catch (error) {
        console.error("Template Processing Error:", error);
        throw new Error(`Failed to process template: ${error instanceof Error ? error.message : 'Invalid format'}`);
    }
};

