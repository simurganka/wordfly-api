// api/polly.ts
export default async function handler(req: any) {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (req.method !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Use POST' })
        };
    }

    try {
        const { text, languageCode, voiceName, speakingRate, pitch, audioFormat } = JSON.parse(req.body);

        if (!text || typeof text !== 'string' || text.trim() === '') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'text is required' })
            };
        }

        // AWS SDK'yı dinamik olarak yükle
        const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');

        const region = process.env.AWS_REGION || 'eu-central-1';
        const polly = new PollyClient({
            region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        const defaultVoice = (languageCode || '').startsWith('tr') ? 'Filiz' : 'Joanna';
        const voiceId = (voiceName as string) || defaultVoice;

        let outputFormat = 'mp3';
        if (audioFormat) {
            const f = audioFormat.toLowerCase();
            if (f === 'ogg') outputFormat = 'ogg_vorbis';
            else if (f === 'pcm') outputFormat = 'pcm';
        }

        const cmd = new SynthesizeSpeechCommand({
            Text: text,
            VoiceId: voiceId,
            LanguageCode: languageCode,
            OutputFormat: outputFormat,
            Engine: 'standard',
            TextType: (speakingRate || pitch) ? 'ssml' : 'text',
        });

        if (speakingRate || pitch) {
            const rate = typeof speakingRate === 'number' ? `${Math.round(speakingRate * 100)}%` : '100%';
            const p = typeof pitch === 'number' ? `${Math.round(pitch)}%` : '0%';
            cmd.input.Text = `<speak><prosody rate="${rate}" pitch="${p}">${text}</prosody></speak>`;
        }

        const result = await polly.send(cmd);
        const audioStream = result.AudioStream;
        if (!audioStream) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'No audio stream' })
            };
        }

        // Buffer kullan
        const buffer = Buffer.from(audioStream);
        const base64 = buffer.toString('base64');
        const contentType =
            outputFormat === 'mp3' ? 'audio/mpeg' :
                outputFormat === 'ogg_vorbis' ? 'audio/ogg' : 'audio/wav';

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ base64, contentType })
        };
    } catch (e) {
        console.error('Polly error:', e);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Polly failed: ' + e.message })
        };
    }
}