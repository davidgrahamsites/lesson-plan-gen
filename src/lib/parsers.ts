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
    const songLine = headerLines.find(l => l.toLowerCase().includes('song') || l.toLowerCase().includes('sing'));
    if (songLine) {
        // Clean up: remove "Song:" prefix if present
        extractedSong = songLine.replace(/song\s*:?/i, '').replace(/sing\s*:?/i, '').trim() || songLine;
    }

    // Heuristic: Look for "Week" + Number in header lines
    const weekLine = headerLines.find(l => /week\s*\d+/i.test(l));
    if (weekLine) {
        const match = weekLine.match(/week\s*\d+/i);
        if (match) extractedWeek = match[0].toUpperCase();
    }

    const findDayInLine = (line: string) => {
        const lower = line.toLowerCase();
        for (const day of days) {
            if (lower.includes(day)) return day;
        }
        for (const [abbr, full] of Object.entries(abbreviations)) {
            // Check for abbreviation as a word (e.g. "Mon" not "Monday")
            const regex = new RegExp(`\\b${abbr}\\b`, 'i');
            if (regex.test(lower)) return full;
        }
        return null;
    };

    // Find a line that looks like a header (contains multiple day names)
    const headerLineIndex = lines.findIndex(line => {
        const lowerLine = line.toLowerCase();
        // Trigger if at least ONE day or abbreviation is found (good for clips)
        return days.some(d => lowerLine.includes(d)) ||
            Object.keys(abbreviations).some(abbr => new RegExp(`\\b${abbr}\\b`, 'i').test(lowerLine));
    });

    const isMetadata = (text: string) => {
        const lower = text.toLowerCase();
        return lower.includes('small group') ||
            lower.includes('song of the week') ||
            lower.includes('weekly') ||
            lower.length < 2;
    };

    if (headerLineIndex !== -1) {
        // COLUMN-BASED TABLE detected
        const headerLine = lines[headerLineIndex];
        const contentLine = lines[headerLineIndex + 1] || "";
        const lowerHeader = headerLine.toLowerCase();

        // Detect all present days in the header
        const presentDays: Array<{ day: string, start: number }> = [];
        days.forEach(day => {
            const start = lowerHeader.indexOf(day);
            if (start !== -1) presentDays.push({ day, start });
        });
        Object.entries(abbreviations).forEach(([abbr, full]) => {
            const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
            let match;
            while ((match = regex.exec(lowerHeader)) !== null) {
                if (!presentDays.some(pd => pd.day === full)) {
                    presentDays.push({ day: full, start: match.index });
                }
            }
        });

        presentDays.sort((a, b) => a.start - b.start).forEach((pd, index) => {
            const start = pd.start;
            const nextPd = presentDays[index + 1];
            const end = nextPd ? nextPd.start : headerLine.length;

            let subject = headerLine.slice(start, end).replace(/[-—|]/g, '').trim();
            // Strip any day names from subject
            days.forEach(d => { subject = subject.replace(new RegExp(d, 'gi'), ''); });
            Object.keys(abbreviations).forEach(abbr => { subject = subject.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), ''); });
            subject = subject.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').trim();

            let content = contentLine.slice(start, end).replace(/[-—|]/g, '').trim();

            if (!isMetadata(subject) || !isMetadata(content)) {
                calendarData[pd.day] = {
                    subject: subject || "Vocabulary",
                    content: isMetadata(content) ? "" : content,
                    game: isMetadata(content) ? "" : content
                };
            }
        });
    } else {
        // ROW-BASED or messy OCR
        days.forEach(day => {
            let dayIndex = lines.findIndex(l => l.toLowerCase().includes(day));
            if (dayIndex === -1) {
                // Try abbreviation
                const abbr = Object.keys(abbreviations).find(a => abbreviations[a] === day);
                if (abbr) dayIndex = lines.findIndex(l => new RegExp(`\\b${abbr}\\b`, 'i').test(l));
            }

            if (dayIndex !== -1) {
                let subject = lines[dayIndex].replace(/[-—|]/g, '').trim();
                days.forEach(d => { subject = subject.replace(new RegExp(d, 'gi'), ''); });
                Object.keys(abbreviations).forEach(abbr => { subject = subject.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), ''); });

                if (isMetadata(subject)) subject = lines[dayIndex + 1] || "General";

                const row2Text = lines.slice(dayIndex + 1, dayIndex + 4).join(' ');

                calendarData[day] = {
                    subject: subject.trim(),
                    content: row2Text,
                    game: row2Text
                };
            }
        });
    }

    // FINAL FALLBACK: If we found NOTHING but the OCR has text, and it's a "clip",
    // assign the whole string to 'monday' or the first day so it's not empty.
    if (Object.keys(calendarData).length === 0 && lines.length > 0) {
        calendarData['monday'] = {
            subject: "Pasted Content",
            content: ocrText,
            game: ocrText
        };
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

