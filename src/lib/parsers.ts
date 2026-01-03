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
    const abbreviations: Record<string, string> = {
        'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday', 'thu': 'thursday', 'fri': 'friday',
        'sat': 'saturday', 'sun': 'sunday'
    };

    let extractedSong = "Song of the Week"; // Default
    let extractedWeek = ""; // Found week label (e.g. "Week 3")

    // Heuristic: Look for "Song" or "Sing" in the FIRST 5 lines (usually header info)
    const headerLines = lines.slice(0, 10);

    let extractedSong = "Song of the Week";
    let extractedWeek = "";

    // 1. Aggressive Week Detection (Look anywhere in text)
    const weekRegex = /week\s*(\d+)/i;
    const weekMatch = ocrText.match(weekRegex);
    if (weekMatch) extractedWeek = `WEEK ${weekMatch[1]}`;

    // 2. Identify Header Lines vs Content Lines
    // A header line contains day names. A content line is usually the one immediately following.
    const headerLineIndex = lines.findIndex(line => {
        const lower = line.toLowerCase();
        return days.some(d => lower.includes(d)) ||
            Object.keys(abbreviations).some(abbr => new RegExp(`\\b${abbr}\\b`, 'i').test(lower));
    });

    if (headerLineIndex !== -1) {
        const headerLine = lines[headerLineIndex];
        const contentLines = lines.slice(headerLineIndex + 1, headerLineIndex + 5);
        const lowerHeader = headerLine.toLowerCase();

        // Find positions of all columns
        const columns: Array<{ day?: string, isSong?: boolean, isSmallGroup?: boolean, start: number, end: number }> = [];

        // Helper to add column if not overlapping
        const addCol = (start: number, end: number, data: any) => {
            if (!columns.some(c => Math.abs(c.start - start) < 5)) {
                columns.push({ start, end, ...data });
            }
        };

        days.forEach(day => {
            const idx = lowerHeader.indexOf(day);
            if (idx !== -1) {
                // Find end: next meaningful space or day
                addCol(idx, idx + day.length, { day });
            }
        });

        Object.entries(abbreviations).forEach(([abbr, full]) => {
            const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
            let match;
            while ((match = regex.exec(lowerHeader)) !== null) {
                addCol(match.index, match.index + abbr.length, { day: full });
            }
        });

        // Special check for Song column
        const songIdx = lowerHeader.indexOf('song');
        if (songIdx !== -1) addCol(songIdx, songIdx + 4, { isSong: true });

        // Sort columns by position to determine boundaries
        columns.sort((a, b) => a.start - b.start);
        for (let i = 0; i < columns.length; i++) {
            columns[i].end = columns[i + 1]?.start || headerLine.length + 20;
        }

        // Process each column
        columns.forEach(col => {
            const segmentHeader = headerLine.slice(col.start, col.end).trim();
            // Get content from the lines below in this horizontal slice
            const segmentContent = contentLines.map(line => {
                if (line.length < col.start) return "";
                return line.slice(col.start, col.end).trim();
            }).filter(s => s.length > 0).join(' ');

            if (col.isSong) {
                if (segmentContent && segmentContent.length > 3) extractedSong = segmentContent;
            } else if (col.day) {
                let subject = segmentHeader.replace(new RegExp(col.day, 'gi'), '').replace(/[-—|:]/g, '').trim();
                Object.keys(abbreviations).forEach(abbr => subject = subject.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), ''));

                calendarData[col.day] = {
                    subject: subject || "Vocabulary",
                    content: segmentContent,
                    game: segmentContent
                };
            }
        });
    }

    // FINAL FALLBACK: If we still have nothing, or if a specific day was requested but not found
    // we assign the most likely content to Monday just so the user isn't blocked.
    if (Object.keys(calendarData).length === 0) {
        days.forEach(day => {
            if (ocrText.toLowerCase().includes(day)) {
                calendarData[day] = { subject: "Vocabulary", content: ocrText, game: ocrText };
            }
        });
    }

    // Last resort fallback
    if (Object.keys(calendarData).length === 0 && lines.length > 0) {
        calendarData['monday'] = { subject: "Pasted Content", content: ocrText, game: ocrText };
    }

    return { data: calendarData, song: extractedSong, week: extractedWeek };
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

