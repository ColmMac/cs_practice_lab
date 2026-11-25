/**
 * The text of /about and /privacy, as data: the React pages and the static <noscript> copy both render it, so they
 * can't drift. `vite.config.ts` imports this in Node, so keep it free of React.
 *
 * The privacy text describes only what actually runs. A new storage key, a new third-party request or new URL
 * state changes this file in the same commit (a unit test checks the storage keys).
 */
import { CONTACT_EMAIL, REPO_URL, SITE_NAME } from '../../config/site.ts'
import { TOOLS } from '../tools.ts'

export type Inline = string | { text: string; href: string }
export type Block = { p: Inline[] } | { ul: Inline[][] }

export interface Section {
  heading: string
  blocks: Block[]
  /** This section ends with the "Manage cookie choices" button (shown only while Google's consent tool is loaded). */
  cookieChoices?: true
}

export interface InfoDoc {
  intro: Inline[]
  sections: Section[]
  /** ISO date. */
  updated?: string
}

const email = { text: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` }

export const PRIVACY_UPDATED = '2026-11-25'

export const ABOUT: InfoDoc = {
  intro: [
    `${SITE_NAME} is a set of free practice tools for the computer science skills that exams ask for, such as tracing a program or filling in a truth table. There is no login and nothing to install.`,
  ],
  sections: [
    {
      heading: 'Who it’s for',
      blocks: [
        {
          p: [
            'Students on UK GCSE, SQA National 5 and Higher, and A-Level computer science courses, university students on a first programming course (CS1), and the people who teach them. Not every tool matches every course, so check your own specification. The site is not affiliated with or endorsed by any exam board.',
          ],
        },
      ],
    },
    {
      heading: 'The tools',
      blocks: [{ ul: TOOLS.map((t) => [{ text: t.name, href: t.path }, `: ${t.blurb}`]) }],
    },
    {
      heading: 'How it works',
      blocks: [
        {
          p: [
            'The tools run in your browser. Python programs are run on your own device by Pyodide, a version of Python that your browser downloads from the jsDelivr network. The code you type and your answers are not uploaded to us. Your work and progress are saved in your browser. The ',
            { text: 'privacy page', href: '/privacy' },
            ' lists what is saved and which other services are involved.',
          ],
        },
      ],
    },
    {
      heading: 'Contact',
      blocks: [{ p: ['Report a mistake, ask a question or suggest an improvement: ', email, '.'] }],
    },
    {
      heading: 'Source code',
      blocks: [{ p: ['The source code is on ', { text: 'GitHub', href: REPO_URL }, '.'] }],
    },
  ],
}

export function privacyDoc(adsEnabled: boolean): InfoDoc {
  return {
    updated: PRIVACY_UPDATED,
    intro: [
      `This page says what happens to information when you use ${SITE_NAME}. “We” means the people who run the site. There are no accounts, and we don’t ask for your name or email address. We run no analytics.`,
    ],
    sections: [
      {
        heading: 'Saved in your browser',
        blocks: [
          {
            p: [
              'The site uses your browser’s local storage so that your work is still there next time. It is not sent to us. These are the entries:',
            ],
          },
          {
            ul: [
              ['tts:v1: your program, its input, watch expressions, trace table settings, and your answers in recent Study mode sessions'],
              ['tts:theme: light or dark mode'],
              ['tts:welcomed: that you have closed the welcome message'],
              ['tts:projector: whether projector mode is on'],
              ['tts:pseudo-dialect: the exam board style chosen for pseudocode'],
              ['hub:mastery:v1: your Study mode scores and which examples you have mastered'],
              ['hub:truth:last: the last Boolean expression on the truth table page'],
            ],
          },
          {
            p: [
              '“Reset my progress” on the home page deletes your scores. To delete everything, clear this site’s data in your browser settings. On a shared computer, the next person to use the same browser profile can see what is saved.',
            ],
          },
        ],
      },
      {
        heading: 'Links and page addresses',
        blocks: [
          {
            p: [
              'A trace table share link keeps the program after the # in the address. Browsers don’t send that part to a web server. Some tools keep settings in the rest of the address, such as a Boolean expression, a list of numbers or an example’s name. If you open or reload such an address, those settings are sent to the host with the request. Don’t put personal information in a program you share or in any of these boxes.',
            ],
          },
        ],
      },
      {
        heading: 'Hosting and the Python runtime',
        blocks: [
          {
            ul: [
              [
                'Cloudflare hosts the site. Like any web host, it receives your IP address, the address you asked for and details about your browser, and keeps standard request logs to deliver and protect the site.',
              ],
              [
                'The trace table tool downloads Python (Pyodide) from jsDelivr, a content delivery network. jsDelivr receives your IP address and details about your browser when that happens. Your program is not sent to it. See the ',
                { text: 'jsDelivr privacy policy', href: 'https://www.jsdelivr.com/terms/privacy-policy' },
                '.',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Adverts (Google AdSense)',
        blocks: [
          {
            p: [
              adsEnabled
                ? 'The site shows adverts from Google AdSense to help pay its costs.'
                : 'Adverts are not switched on yet: the site does not currently load anything from Google’s advertising services. The rest of this section applies once they are switched on.',
            ],
          },
          {
            p: [
              'We ask Google for non-personalised adverts only, because many of our users are under 18. These adverts are not chosen from a profile of you or your past browsing. They can depend on the page you are on and your approximate location. Google and its partners can still use cookies, local storage and device identifiers to limit how often an advert appears, to measure adverts and to prevent fraud. They receive your IP address, details about your browser and the address of the page you are on.',
            ],
          },
          {
            p: [
              'Google decides for itself how it uses this information, as an independent controller. Read ',
              {
                text: 'How Google uses information from sites that use our services',
                href: 'https://policies.google.com/technologies/partner-sites',
              },
              '. You can control advert settings with ',
              { text: 'Google Ads Settings', href: 'https://adssettings.google.com' },
              ', ',
              { text: 'YourAdChoices', href: 'https://youradchoices.com' },
              ' or ',
              { text: 'Your Online Choices', href: 'https://www.youronlinechoices.com' },
              '. You can also block or delete cookies in your browser; the tools keep working.',
            ],
          },
        ],
      },
      {
        heading: 'UK and EEA: lawful bases and consent',
        cookieChoices: true,
        blocks: [
          { p: ['Under the UK GDPR and the EU GDPR, we rely on:'] },
          {
            ul: [
              ['Legitimate interests, to deliver and protect the site (host logs and the Python download) and to answer messages you send us.'],
              ['Consent, for advertising cookies and similar storage. Google’s consent message asks for it before it is needed, and you can change your answer at any time.'],
            ],
          },
          {
            p: [
              'The browser storage listed above is used only to provide features you use. These services may process information outside the UK and EEA, under their own safeguards.',
            ],
          },
          {
            p: ['While Google’s consent tool is running on this site, a “Manage cookie choices” button appears below.'],
          },
        ],
      },
      {
        heading: 'Children',
        blocks: [
          {
            p: [
              'Many students who use the site are 14 to 16 years old. We don’t ask anyone for personal details, we don’t build profiles, and adverts are requested as non-personalised for everyone. If you are a parent or teacher with a concern, contact us.',
            ],
          },
        ],
      },
      {
        heading: 'Your rights',
        blocks: [
          {
            p: [
              'You can ask for a copy of personal information we hold about you, ask us to correct or delete it, ask us to restrict how it is used, object to its use, and withdraw consent. We can’t see what is saved in your browser; you control that yourself. For information held by Google, Cloudflare or jsDelivr, you can also contact them directly.',
            ],
          },
          {
            p: [
              'If you are unhappy with how your information has been handled, please tell us. You can also complain to the ',
              { text: 'Information Commissioner’s Office (ICO)', href: 'https://ico.org.uk/make-a-complaint/' },
              ' or, in the EEA, to your local data protection authority.',
            ],
          },
        ],
      },
      {
        heading: 'Contact',
        blocks: [
          {
            p: ['Privacy questions and requests: ', email, '. If you email us, we use your message and address only to deal with it.'],
          },
        ],
      },
    ],
  }
}
