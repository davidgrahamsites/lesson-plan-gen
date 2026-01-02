import Tesseract from 'tesseract.js';

export const OCRProcessor = async (file: File) => {
    const result = await Tesseract.recognize(file, 'eng', {
        logger: m => console.log(m)
    });
    return result.data.text;
};

export const AISynthesizer = async (
    gameDesc: string,
    learningTargets: string,
    provider: 'openai' | 'gemini',
    apiKey: string
) => {
    const prompt = `
    You are an educational assistant. 
    Modify the following game description to incorporate the specific learning targets for the day.
    
    Original Game Description:
    "${gameDesc}"
    
    Learning Targets for the day:
    "${learningTargets}"
    
    Instructions:
    - Keep the core mechanics of the game.
    - Replace generic placeholders (like [skill], [topic], etc.) with the actual learning targets.
    - The output should be the modified game description only.
  `;

    if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } else {
        // Gemini implementation
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }
};
