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

    // 1. Cluster words into ROWS based on Y-coordinate
    const rows: { words: typeof ocrWords, yMin: number, yMax: number }[] = [];
    ocrWords.sort((a, b) => a.bbox.y0 - b.bbox.y0).forEach(word => {
        const h = word.bbox.y1 - word.bbox.y0;
        const mid = word.bbox.y0 + h / 2;
        let matchedRow = rows.find(r => mid >= r.yMin && mid <= r.yMax);

        if (!matchedRow) {
            rows.push({ words: [word], yMin: word.bbox.y0, yMax: word.bbox.y1 });
        } else {
            matchedRow.words.push(word);
            matchedRow.yMin = Math.min(matchedRow.yMin, word.bbox.y0);
            matchedRow.yMax = Math.max(matchedRow.yMax, word.bbox.y1);
        }
    });

    rows.forEach(r => r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));

    // 2. Identify Header Row
    const headerRow = rows.find(row => {
        const rowText = row.words.map(w => w.text.toLowerCase()).join(' ');
        const dayCount = days.filter(d => rowText.includes(d)).length;
        const abbrCount = Object.keys(abbreviations).filter(abbr => rowText.includes(abbr)).length;
        return (dayCount + abbrCount) >= 2;
    });

    // 3. Robust Week Detection
    const weekWord = ocrWords.find(w => w.text.toLowerCase().includes('week'));
    if (weekWord) {
        const idx = ocrWords.indexOf(weekWord);
        const nearWords = ocrWords.slice(idx, idx + 3).map(w => w.text).join(' ');
        const match = nearWords.match(/week\s*([1-8])/i);
        if (match) extractedWeek = `WEEK ${match[1]}`;
    }

    if (headerRow) {
        // 4. Define Columns
        const cols: { day: string, xMin: number, xMax: number, subject: string, isSong?: boolean }[] = [];

        headerRow.words.forEach(word => {
            const lower = word.text.toLowerCase().replace(/[^a-z]/g, '');
            const dayMatch = days.find(d => lower.includes(d)) || abbreviations[lower];

            if (dayMatch) {
                cols.push({ day: dayMatch, xMin: word.bbox.x0, xMax: word.bbox.x1, subject: "" });
            } else if (lower.includes('song')) {
                cols.push({ day: 'song', xMin: word.bbox.x0, xMax: word.bbox.x1, subject: "", isSong: true });
            } else if (cols.length > 0) {
                const lastCol = cols[cols.length - 1];
                lastCol.xMax = Math.max(lastCol.xMax, word.bbox.x1);
                lastCol.subject += (lastCol.subject ? " " : "") + word.text;
            }
        });

        // Refine boundaries
        for (let i = 0; i < cols.length; i++) {
            const current = cols[i];
            const next = cols[i + 1];
            if (next) {
                const mid = (current.xMax + next.xMin) / 2;
                current.xMax = mid;
                next.xMin = mid;
            } else {
                current.xMax = 10000;
            }
        }

        // 5. Extract Content
        const headerIndex = rows.indexOf(headerRow);
        const contentRows = rows.slice(headerIndex + 1, headerIndex + 5);

        cols.forEach(col => {
            const content = contentRows.flatMap(r =>
                r.words.filter(w => {
                    const wMid = (w.bbox.x0 + w.bbox.x1) / 2;
                    return wMid >= col.xMin && wMid <= col.xMax;
                })
            ).map(w => w.text).join(' ');

            if (col.isSong) {
                if (content && content.length > 3) extractedSong = content;
            } else if (col.day !== 'song') {
                calendarData[col.day] = {
                    subject: col.subject.replace(/[-—|:]/g, '').trim() || "Vocabulary",
                    content: content,
                    game: content
                };
            }
        });
    }

    if (Object.keys(calendarData).length === 0) {
        const fullText = ocrWords.map(w => w.text).join(' ');
        days.forEach(day => {
            if (fullText.toLowerCase().includes(day)) {
                calendarData[day] = { subject: "Pasted Content", content: fullText, game: fullText };
            }
        });
    }

    if (Object.keys(calendarData).length === 0) {
        calendarData['monday'] = {
            subject: "Pasted Content",
            content: ocrWords.map(w => w.text).join(' '),
            game: ocrWords.map(w => w.text).join(' ')
        };
    }

    return { data: calendarData, song: extractedSong, week: extractedWeek };

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

