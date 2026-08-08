// Gmail-style auto-linking: turns URLs (http/https), www. links and email
// addresses in plain text into clickable links while preserving newlines.
const LINK_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[\w.+-]+@[\w-]+\.[\w.-]+)/gi
const TRAILING_PUNCT = /[.,;:!?)]+$/

function normalizeLink(match) {
  const isEmail = /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(match)
  let label = match
  let href = match
  if (isEmail) {
    href = 'mailto:' + href
  } else {
    label = label.replace(TRAILING_PUNCT, '')
    href = label
    if (/^www\./i.test(href)) href = 'https://' + href
  }
  return { label, href, isEmail }
}

function isLinkStart(part) {
  return /^(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.-]+)/i.test(part)
}

export default function LinkifiedText({ text, className = '' }) {
  if (text == null || String(text).trim() === '') return null
  const parts = String(text).split(LINK_REGEX)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part) return null
        if (isLinkStart(part)) {
          const { label, href } = normalizeLink(part)
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1d4ed8] underline underline-offset-2 break-all hover:opacity-80 transition-opacity"
            >
              {label}
            </a>
          )
        }
        return part
      })}
    </span>
  )
}
