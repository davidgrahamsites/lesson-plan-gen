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

export const CalendarTableParser = (ocrWords: { text: string, bbox: { x0: number, y0: number, x1: number, y1: number } }[]) => {
    const calendarData: Record<string, { subject: string, content: string, game: string }> = {};
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const abbreviations: Record<string, string> = {
        'sun': 'sunday', 'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday', 'thu': 'thursday', 'fri': 'friday', 'sat': 'saturday'
    };

    let extractedSong = "Song of the Week";
    let extractedWeek = "";

    if (!ocrWords || ocrWords.length === 0) return { data: {}, song: "", week: "" };

    // 1. Cluster words into ROWS
    const rows: { words: typeof ocrWords, y0: number, y1: number }[] = [];
    ocrWords.sort((a, b) => a.bbox.y0 - b.bbox.y0).forEach(word => {
        const midWord = (word.bbox.y0 + word.bbox.y1) / 2;
        let matchedRow = rows.find(r => midWord >= r.y0 && midWord <= r.y1);
        if (!matchedRow) {
            rows.push({ words: [word], y0: word.bbox.y0, y1: word.bbox.y1 });
        } else {
            matchedRow.words.push(word);
            matchedRow.y0 = Math.min(matchedRow.y0, word.bbox.y0);
            matchedRow.y1 = Math.max(matchedRow.y1, word.bbox.y1);
        }
    });
    rows.forEach(r => r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));

    // 2. Identify Header Zone (Rows containing day names)
    const headerRowIndices = rows.map((r, i) => {
        const text = r.words.map(w => w.text.toLowerCase()).join(' ');
        const hasDay = days.some(d => text.includes(d)) || Object.keys(abbreviations).some(abbr => text.includes(abbr));
        return hasDay ? i : -1;
    }).filter(i => i !== -1);

    if (headerRowIndices.length === 0) return { data: {}, song: "", week: "" };

    const firstHeader = headerRowIndices[0];
    const lastHeader = headerRowIndices[headerRowIndices.length - 1];
    const headerWords = rows.slice(firstHeader, lastHeader + 1).flatMap(r => r.words);

    // 3. Robust Week Detection (Aggressive search)
    const allText = ocrWords.map(w => w.text).join(' ');
    // Look for standalone digits 1-8 near the word "Week"
    const weekWordMatch = allText.match(/week\s*([1-8])\b/i);
    if (weekWordMatch) {
        extractedWeek = `WEEK ${weekWordMatch[1]}`;
    } else {
        const weekW = ocrWords.find(w => w.text.toLowerCase().includes('week'));
        if (weekW) {
            const idx = ocrWords.indexOf(weekW);
            const near = ocrWords.slice(Math.max(0, idx - 2), idx + 5);
            const num = near.find(w => /\b[1-8]\b/.test(w.text));
            if (num) extractedWeek = `WEEK ${num.text}`;
        }
    }

    // 4. Define Columns from Header Zone
    const cols: { day: string, xMin: number, xMax: number, subject: string, isSong?: boolean }[] = [];
    headerWords.forEach(word => {
        const clean = word.text.toLowerCase().replace(/[^a-z]/g, '');
        const dayMatch = days.find(d => clean === d) || abbreviations[clean];
        if (dayMatch && !cols.some(c => c.day === dayMatch)) {
            cols.push({ day: dayMatch, xMin: word.bbox.x0, xMax: word.bbox.x1, subject: "" });
        } else if (clean.includes('song') && !cols.some(c => c.isSong)) {
            cols.push({ day: 'song', xMin: word.bbox.x0, xMax: word.bbox.x1, subject: "", isSong: true });
        }
    });
    cols.sort((a, b) => a.xMin - b.xMin);

    headerWords.forEach(word => {
        const clean = word.text.toLowerCase().replace(/[^a-z]/g, '');
        const isDayOrSong = days.some(d => clean === d) || abbreviations[clean] || clean.includes('song');
        if (!isDayOrSong && word.text.length > 2) {
            const mid = (word.bbox.x0 + word.bbox.x1) / 2;
            const target = cols.find(c => mid >= c.xMin - 15 && mid <= c.xMax + 15) ||
                cols.find((c, i) => mid < (cols[i + 1]?.xMin || 10000));
            if (target && !target.isSong) {
                target.subject += (target.subject ? " " : "") + word.text;
                target.xMin = Math.min(target.xMin, word.bbox.x0);
                target.xMax = Math.max(target.xMax, word.bbox.x1);
            }
        }
    });

    for (let i = 0; i < cols.length; i++) {
        const curr = cols[i], nxt = cols[i + 1];
        if (nxt) { const m = (curr.xMax + nxt.xMin) / 2; curr.xMax = m; nxt.xMin = m; }
        else { curr.xMax = 10000; }
    }

    // 5. Extract Content
    const contentRows = rows.slice(lastHeader + 1);
    cols.forEach(col => {
        const content = contentRows.flatMap(r =>
            r.words.filter(w => {
                const wMid = (w.bbox.x0 + w.bbox.x1) / 2;
                return wMid >= col.xMin && wMid <= col.xMax;
            })
        ).map(w => w.text).join(' ');

        if (col.isSong) {
            if (content && content.length > 3) extractedSong = content;
        } else {
            calendarData[col.day] = {
                subject: col.subject.replace(/[-—|:\[\]]/g, '').trim() || "Vocabulary",
                content: content,
                game: content
            };
        }
    });

    if (Object.keys(calendarData).length === 0) {
        days.forEach(day => { if (allText.toLowerCase().includes(day)) calendarData[day] = { subject: "Pasted Content", content: allText, game: allText }; });
    }
    if (Object.keys(calendarData).length === 0) {
        calendarData['monday'] = { subject: "Pasted Content", content: allText, game: allText };
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

