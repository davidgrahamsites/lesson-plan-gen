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
