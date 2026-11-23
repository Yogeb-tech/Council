import { describe, expect, it } from 'vitest'
import { memoToHtml, memoToPlainText } from './memo-email'
import { emailBody, emailHtml, type DeliveryInput } from './finalize'

const memo = [
  '## Executive summary',
  'Postgres leads with **3 of 4** votes.',
  '',
  '## Strongest arguments for',
  '- **Alice:** we already run it',
  '* Bob: mature tooling',
].join('\n')

describe('memoToHtml', () => {
  it('renders headings, bullets and bold', () => {
    const html = memoToHtml(memo)
    expect(html).toContain('>Executive summary</h2>')
    expect(html).toContain('Postgres leads with <strong>3 of 4</strong> votes.')
    expect(html).toMatch(/<ul[^>]*><li[^>]*><strong>Alice:<\/strong> we already run it<\/li><li[^>]*>Bob: mature tooling<\/li><\/ul>/)
    expect(html).not.toContain('##')
  })

  it('escapes everything from the memo, so it cannot add markup', () => {
    const html = memoToHtml('## <img src=x onerror=alert(1)>\n- <a href="javascript:x">click</a> & **<b>bold</b>**')
    expect(html).not.toMatch(/<img|<a |<b>/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;a href=&quot;javascript:x&quot;&gt;click&lt;/a&gt; &amp; <strong>&lt;b&gt;bold&lt;/b&gt;</strong>')
  })
})

describe('memoToPlainText', () => {
  it('drops the Markdown symbols', () => {
    expect(memoToPlainText(memo)).toBe(
      ['EXECUTIVE SUMMARY', 'Postgres leads with 3 of 4 votes.', 'STRONGEST ARGUMENTS FOR', '• Alice: we already run it\n• Bob: mature tooling'].join('\n\n'),
    )
  })
})

describe('email bodies', () => {
  const input: DeliveryInput = {
    decisionId: 'd1',
    decision: { teamId: 't', title: 'DB <script>', deadline: '', status: 'closed' },
    team: { teamId: 't', name: 'Platform & Co' },
    memo,
    link: 'https://council.app.space/decisions/d1',
    creatorId: 'alice',
  }

  it('the HTML version has the memo, an escaped title and the link', () => {
    const html = emailHtml(input)
    expect(html).toContain('<strong>DB &lt;script&gt;</strong> in Platform &amp; Co has closed.')
    expect(html).toContain('<a href="https://council.app.space/decisions/d1"')
    expect(html).toContain('<strong>3 of 4</strong>')
  })

  it('the plain-text version has no Markdown symbols', () => {
    const text = emailBody(input)
    expect(text).not.toMatch(/##|\*\*/)
    expect(text).toContain('• Alice: we already run it')
  })
})
