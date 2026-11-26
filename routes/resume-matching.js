const { FeedbackError } = require('../services/resume-feedback');

const ERRORS = {
  refused: [422, 'The matcher could not analyze this resume. Try a different file.'],
  unreadable: [422, 'The matcher could not read this resume. Upload a text-based PDF or DOCX.'],
  incomplete: [502, 'The match was cut short. Please try again.'],
  invalid_output: [502, 'The match came back in an unexpected format. Please try again.'],
  busy: [503, 'The matcher is busy right now. Please try again shortly.'],
  unavailable: [503, 'The matcher is unavailable right now. Please try again later.'],
  not_configured: [503, 'AI resume matching is not configured on this server.']
};
const readId = value => {
  const id = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
};
const countWords = text => text.trim().split(/\s+/).filter(Boolean).length;

async function getPostingText(body) {
  if (typeof body.description === 'string' && body.description.trim()) return body.description.trim();
  if (typeof body.url !== 'string' || !body.url.trim()) return '';
  let url;
  try { url = new URL(body.url); } catch { throw Object.assign(new Error('Enter a valid job posting URL.'), { status: 400 }); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i.test(url.hostname)) {
    throw Object.assign(new Error('Enter a public HTTP or HTTPS job posting URL.'), { status: 400 });
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'CareerConnect job matcher' } });
  if (!response.ok) throw Object.assign(new Error('Could not load that job posting. Paste its description instead.'), { status: 422 });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/')) throw Object.assign(new Error('That URL did not return readable job posting text. Paste the description instead.'), { status: 422 });
  const html = (await response.text()).slice(0, 1_000_000);
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim();
}

const HARD = /\b(java|javascript|typescript|python|sql|c\+\+|\.net|react|angular|node(?:\.js)?|aws|azure|gcp|docker|kubernetes|git|html|css|excel|tableau|power bi|machine learning|data analysis|project management|agile|scrum|accounting|salesforce|figma|linux|rest api|api development|testing|cybersecurity)\b/i;
const SOFT = /\b(communication|teamwork|leadership|collaboration|adaptability|problem.solving|time management|critical thinking|creativity|organization|interpersonal|initiative|attention to detail|customer service|conflict resolution|mentoring|presentation)\b/i;
function categorize(items) {
  const output = { keywords: [], hardSkills: [], softSkills: [] };
  for (const item of items) {
    const category = HARD.test(item) ? 'hardSkills' : SOFT.test(item) ? 'softSkills' : 'keywords';
    if (!output[category].includes(item)) output[category].push(item);
  }
  return output;
}

function registerResumeMatchingRoutes(app, pool, authenticateUser, resumeFeedback) {
  app.post('/api/resume-matches', authenticateUser, async (req, res, next) => {
    const startedAt = Date.now();
    const resumeId = req.body?.resumeId ? readId(req.body.resumeId) : null;
    const resumeText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : '';
    if ((!resumeId && !resumeText) || (resumeId && resumeText)) return res.status(400).json({ message: 'Select a saved resume or provide your profile/resume text.' });
    if (resumeText.length > 100000) return res.status(400).json({ message: 'Resume text must be 100,000 characters or fewer.' });
    if (req.body?.description && req.body?.url) return res.status(400).json({ message: 'Provide a job description or a URL, not both.' });
    try {
      const description = await getPostingText(req.body || {});
      if (countWords(description) < 50) return res.status(400).json({ message: 'The job posting is too short. Provide a complete description of at least 50 words.' });
      let resume = null;
      if (resumeId) {
        const result = await pool.query('SELECT id, storage_path, mime_type FROM resumes WHERE id=$1 AND user_id=$2', [resumeId, req.user.id]);
        if (!result.rowCount) return res.status(404).json({ message: 'Resume not found.' });
        resume = result.rows[0];
      }
      let analysis;
      try {
        let timeout;
        try {
          analysis = await Promise.race([
            resumeFeedback.analyze({ ...(resume ? { filePath: resume.storage_path, mimeType: resume.mime_type } : { resumeText }), job: { title: 'Target position', company: 'Job posting', description, requirements: '' } }),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new FeedbackError('unavailable', 'Analysis exceeded the response time limit.')), Math.max(1, 9800 - (Date.now() - startedAt))); })
          ]);
        } finally { clearTimeout(timeout); }
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        if (!(error instanceof FeedbackError) || !ERRORS[error.code]) throw error;
        const [status, message] = ERRORS[error.code];
        return res.status(status).json({ message });
      }
      const matched = categorize(analysis.feedback.jobMatch.matchedSkills);
      const missing = categorize(analysis.feedback.jobMatch.missingSkills);
      res.json({ score: analysis.feedback.jobMatch.score, matched, missing });
    } catch (error) { next(error); }
  });
}

module.exports = { registerResumeMatchingRoutes, countWords, categorize };
