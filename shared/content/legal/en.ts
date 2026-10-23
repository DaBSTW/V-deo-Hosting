import type { LegalSlug } from "#shared/content/legal/links";
import type { LegalDoc, OperatorInfo } from "./types";

/**
 * Legal texts in English. A reasonable starting point for a video hosting
 * platform with advertising and creator payouts, but they MUST be reviewed
 * by a lawyer in your jurisdiction before publishing.
 */
export function legalDocsEn(o: OperatorInfo): Record<LegalSlug, LegalDoc> {
  /** Avoids a double period when the name ends with "." (e.g. "Inc."). */
  const end = (s: string) => (s.endsWith(".") ? s : `${s}.`);
  const where = o.jurisdiction ? ` of ${o.jurisdiction}` : " of the country where the operator is established";
  return {
    terms: {
      title: "Terms of Service",
      summary: `The rules that govern your use of ${o.app}. By creating an account or using the service you agree to these terms.`,
      sections: [
        {
          title: "1. Who we are and acceptance",
          blocks: [
            `${o.app} (the “service”) is operated by ${end(`${o.entity}${o.address ? `, ${o.address}` : ""}`)} By signing up, uploading content or using the service in any way, you agree to these Terms, the Privacy Policy, the Cookie Policy, the Acceptable Use Policy and the Copyright Policy, which form part of this agreement.`,
            "If you do not agree with any of these terms, do not use the service.",
          ],
        },
        {
          title: "2. The service",
          blocks: [
            "The service lets you host videos, manage them and share them through direct links and embed codes (iframes) on other websites. Content is stored and delivered through third-party infrastructure providers.",
            "We may change, add or remove features at any time. We will try to give advance notice of significant changes.",
          ],
        },
        {
          title: "3. Accounts",
          blocks: [
            {
              list: [
                "You must be at least 18 years old or the age of majority in your country.",
                "You must provide accurate information and keep your password secret. You are responsible for all activity under your account.",
                "You may not create accounts automatically, or hold multiple accounts to evade limits, sanctions or the monetization rules.",
              ],
            },
          ],
        },
        {
          title: "4. Your content",
          blocks: [
            "You keep all rights to the videos and materials you upload. To provide the service, you grant us a worldwide, non-exclusive, royalty-free licence, transferable to our providers, to host, copy, transcode, create thumbnails for, store, display and distribute your content through the links and players you share, and to show advertising alongside it.",
            "This licence ends when you delete the content, except for residual backup copies for a limited time and as needed to comply with legal obligations or resolve disputes.",
            "You confirm that you have all the rights and permissions needed for the content you upload, including from the people who appear in it, and that the content does not break the law or these Terms.",
          ],
        },
        {
          title: "5. Rules of use",
          blocks: [
            "You must follow the Acceptable Use Policy. We may remove content, limit features or suspend accounts that violate it, with or without prior notice, especially where there is a risk to others or a legal obligation.",
          ],
        },
        {
          title: "6. Copyright",
          blocks: [
            "We respect intellectual property and respond to infringement notices under our Copyright Policy. We terminate the accounts of repeat infringers.",
          ],
        },
        {
          title: "7. Advertising and monetization",
          blocks: [
            "Public watch pages and embedded players show third-party advertising on every video; creators cannot turn it off (viewers with the Premium subscription don’t see it). In return, every creator takes part in the monetization program, which is governed by the Monetization Program Terms.",
          ],
        },
        {
          title: "8. Premium subscription",
          blocks: [
            `Premium is an optional paid subscription for viewers: ad-free playback on ${o.app}, downloads without the ${o.freeDownloadWaitSec}-second wait${o.freeSpeedLimit ? " and without a speed limit" : ""}. Prices: ${o.premiumMonthlyUsd.toFixed(2)} USD per month or ${o.premiumYearlyUsd.toFixed(2)} USD per year, including applicable taxes unless the checkout page says otherwise.`,
            {
              list: [
                "Payments are processed by PayPal. We do not store your card or PayPal account details; only the subscription and payment identifiers.",
                "The subscription renews automatically at the end of each period until you cancel it. You can cancel at any time from your dashboard or from PayPal; you keep the benefits until the end of the period you already paid for.",
                "Unless the law of your country provides otherwise, periods that have already started are not refunded. If a payment is refunded or reversed, the related benefits end.",
                "We may change the price with prior notice; the new price only applies to new subscriptions or from the next renewal after the notice.",
                "In players embedded on other websites, the benefits depend on your browser allowing the Premium cookie; if it blocks it, the player behaves as for a free user.",
                `${o.premiumSharePct}% of the net Premium revenue is shared among creators according to the subscriber views their videos receive, under the Monetization Program Terms.`,
              ],
            },
          ],
        },
        {
          title: "9. Suspension and termination",
          blocks: [
            "You may stop using the service and delete your content at any time. We may suspend or terminate your account if you violate these Terms, if the law requires it, or if your use puts the service or others at risk. In cases of fraud, pending earnings may be withheld under the Monetization Program Terms.",
          ],
        },
        {
          title: "10. Disclaimer of warranties",
          blocks: [
            "The service is provided “as is” and “as available”. To the extent permitted by law, we do not guarantee that it will be uninterrupted or error-free, or that stored content cannot be lost. We recommend keeping copies of your original files.",
          ],
        },
        {
          title: "11. Limitation of liability",
          blocks: [
            "To the extent permitted by law, we are not liable for indirect damages, lost profits, data loss or damages arising from user content. Our total liability to you will not exceed the greater of the amount you paid us in the last 12 months or USD 100. Nothing here limits liability that cannot be limited by law.",
          ],
        },
        {
          title: "12. Indemnity",
          blocks: ["You agree to hold us harmless from third-party claims arising from the content you upload or from your breach of these Terms."],
        },
        {
          title: "13. Governing law",
          blocks: [
            `These Terms are governed by the laws${where}. Any dispute will be submitted to the competent courts of that jurisdiction, without prejudice to the rights granted to you by the consumer protection laws of your country of residence.`,
          ],
        },
        {
          title: "14. Changes",
          blocks: [
            "We may update these Terms. If the changes are significant, we will notify you through the service or by email before they take effect. If you keep using the service afterwards, you accept the new version.",
          ],
        },
        { title: "15. Contact", blocks: [`For any questions about these Terms: ${o.email}.`] },
      ],
    },

    privacy: {
      title: "Privacy Policy",
      summary: "What personal data we process, why, who we share it with, how long we keep it and how to exercise your rights.",
      sections: [
        {
          title: "1. Data controller",
          blocks: [`${end(`${o.entity}${o.address ? `, ${o.address}` : ""}`)} Privacy contact: ${o.email}.`],
        },
        {
          title: "2. Data we process",
          blocks: [
            {
              list: [
                "Account data: email, name (optional) and password (stored only as a bcrypt hash, never in plain text). We also store the date you accepted these documents.",
                "Content: the videos you upload, their titles, thumbnails, folders and technical metadata (duration, size).",
                "Usage statistics: views and downloads aggregated per video and day, and the viewer’s country (provided by our delivery network). IP addresses are used only temporarily in memory to prevent double counting and fraud; they are not stored in our database.",
                "Monetization: payout method and destination (for example, PayPal email or wallet address), earnings and payout history.",
                "Identity verification (only if you request a payout): legal name, date of birth, country, document type and number, photos of the document and a selfie holding it.",
                "Cookies and local storage: see the Cookie Policy.",
              ],
            },
          ],
        },
        {
          title: "3. Purposes and legal bases",
          blocks: [
            {
              list: [
                "Providing the service (hosting, playing, sharing and managing your content and account): performance of the contract.",
                "Calculating and paying monetization earnings: performance of the contract.",
                "Verifying your identity before paying you, preventing fraud and money laundering, and meeting tax obligations: legal obligation and legitimate interest.",
                "Protecting the service against abuse and fraudulent traffic: legitimate interest.",
                "Showing advertising on public watch pages: legitimate interest and, where the law requires it, your consent.",
                "Handling legal requests, such as copyright notices or requests from authorities: legal obligation.",
              ],
            },
          ],
        },
        {
          title: "4. Who we share data with",
          blocks: [
            "We do not sell your personal data. We share it only with providers that help us run the service and act on our instructions:",
            {
              list: [
                "Video storage and delivery providers (content delivery network).",
                "The provider of the server that hosts the platform and its database.",
                "Advertising networks (such as Monetag), which may process data about viewers of public pages under their own privacy policies.",
                "Payment providers (such as PayPal, Payoneer, cryptocurrency networks or your bank) to send you your earnings.",
                "PayPal, to charge the Premium subscription. PayPal processes your payment data as an independent controller under its own privacy policy; we only receive the subscription status and the amount of each payment.",
                "Authorities, when required by law.",
              ],
            },
          ],
        },
        {
          title: "5. International transfers",
          blocks: ["Some providers may process data outside your country. In those cases we apply the safeguards required by applicable law, such as standard contractual clauses."],
        },
        {
          title: "6. How long we keep data",
          blocks: [
            {
              list: [
                "Account and content: while your account is active. Deleting a video deletes its files and statistics.",
                `Identity verification images: automatically deleted ${o.kycRetentionDays} days after the verification is approved or rejected. We keep a minimal record: name, country, document type, its last 4 characters and the decision.`,
                "Payout records: for as long as tax and accounting laws require.",
              ],
            },
          ],
        },
        {
          title: "7. Security",
          blocks: [
            "We use encrypted connections (HTTPS) and hashed passwords. Identity documents and numbers are encrypted with AES-256-GCM before being stored, and only authorised members of the payouts team can view them. No system is infallible: if we detect a breach affecting your data, we will notify you as required by law.",
          ],
        },
        {
          title: "8. Your rights",
          blocks: [
            `You can request access, rectification, erasure, portability, restriction of processing or object to processing by writing to ${o.email}. You can also withdraw your consent where it is the legal basis, and lodge a complaint with the data protection authority in your country.`,
          ],
        },
        { title: "9. Minors", blocks: ["The service is not intended for anyone under 18. If we find an account belonging to a minor, we will close it."] },
        { title: "10. Changes", blocks: ["If we change this policy in a significant way, we will let you know before the change takes effect."] },
      ],
    },

    cookies: {
      title: "Cookie Policy",
      summary: "Which cookies and storage technologies we use and how you can manage them.",
      sections: [
        {
          title: "1. What they are",
          blocks: ["Cookies are small files your browser stores when you visit a website. Local storage (localStorage) serves a similar purpose."],
        },
        {
          title: "2. Our own cookies (necessary)",
          blocks: [
            {
              list: [
                "vh_session: keeps you signed in. Strictly necessary; lasts 7 days.",
                "dp: signed pass that tells whether your account is Premium, so you don't see ads or waits (also in embedded players). Lasts at most 3 days and renews itself.",
                "NEXT_LOCALE: remembers the language you chose. Lasts 1 year.",
              ],
            },
          ],
        },
        {
          title: "3. Local storage",
          blocks: [
            {
              list: [
                "dash:view: remembers whether you prefer to see your videos as a grid or a list.",
                "player: player preferences such as volume or quality.",
              ],
            },
            "This data stays in your browser and is not sent to our servers.",
          ],
        },
        {
          title: "4. Third-party cookies (advertising)",
          blocks: [
            "Public watch pages and embedded players of monetized videos may load code from advertising networks such as Monetag. These networks may use their own cookies or identifiers to show ads, cap their frequency and measure results, under each network’s privacy policy. The user dashboard does not load advertising.",
          ],
        },
        {
          title: "5. How to manage them",
          blocks: [
            "You can block or delete cookies in your browser settings. If you block necessary cookies, you will not be able to sign in. Blocking advertising cookies does not prevent you from watching videos.",
          ],
        },
      ],
    },

    copyright: {
      title: "Copyright Policy (DMCA)",
      summary: "How to report content that infringes your rights and how to respond to a notice.",
      sections: [
        {
          title: "1. Our commitment",
          blocks: [
            "We do not allow content that infringes intellectual property rights. We respond to valid notices following a procedure modelled on the U.S. Digital Millennium Copyright Act (DMCA) and equivalent laws.",
          ],
        },
        {
          title: "2. How to send a notice",
          blocks: [
            `Send your notice to ${o.dmcaEmail} including:`,
            {
              list: [
                "Identification of the copyrighted work you believe has been infringed.",
                "The exact link or links to the infringing content on our service (for example, the /v/… or /embed/… URL).",
                "Your name, postal address, phone number and email.",
                "A statement that you have a good-faith belief that the use is not authorised by the owner, its agent or the law.",
                "A statement that the information is accurate and that you are the rights holder or authorised to act on their behalf.",
                "Your physical or electronic signature.",
              ],
            },
          ],
        },
        {
          title: "3. What we do",
          blocks: [
            "If the notice is valid, we will promptly remove or disable access to the content and notify the user who uploaded it, sending them a copy of the notice without unnecessary personal data.",
          ],
        },
        {
          title: "4. Counter-notice",
          blocks: [
            `If you believe content was removed by mistake, you can send a counter-notice to ${o.dmcaEmail} with: identification of the removed content and where it appeared; a statement, under penalty of perjury, that you have a good-faith belief it was removed by mistake or misidentification; your name, address and phone number; your consent to the competent jurisdiction; and your signature. If the complainant does not take legal action within 10 to 14 business days, we may restore the content.`,
          ],
        },
        {
          title: "5. Repeat infringers",
          blocks: ["We terminate the accounts of users who repeatedly infringe rights. Their pending earnings may be withheld."],
        },
        {
          title: "6. False notices",
          blocks: ["Submitting false or bad-faith notices or counter-notices may result in legal liability."],
        },
      ],
    },

    "acceptable-use": {
      title: "Acceptable Use Policy",
      summary: "Which content and behaviour are not allowed on the service.",
      sections: [
        {
          title: "1. Prohibited content",
          blocks: [
            {
              list: [
                "Any child sexual abuse or exploitation material. Zero tolerance: we will remove it and report it to the competent authorities.",
                "Sexually explicit or pornographic content, and intimate content shared without the consent of the people who appear in it.",
                "Content that infringes copyright, trademarks or other third-party rights.",
                "Content that promotes terrorism or serious violence, or incites hatred or discrimination on any grounds.",
                "Harassment, threats or publishing other people’s personal data without consent (doxxing).",
                "Malware, phishing, scams or content designed to deceive viewers.",
                "Any content that is illegal in your country or the operator’s.",
              ],
            },
          ],
        },
        {
          title: "2. Prohibited behaviour",
          blocks: [
            {
              list: [
                "Generating artificial traffic: bots, click farms, incentivised views, auto-refresh or any method to inflate views or earnings.",
                "Repeatedly watching or downloading your own videos to generate revenue.",
                "Circumventing the service’s security measures, limits or anti-fraud controls.",
                "Scraping, abusive bulk uploads or any use that degrades the service for others.",
                "Using the service as generic file storage for non-video files, or to distribute spam.",
              ],
            },
          ],
        },
        {
          title: "3. Consequences",
          blocks: [
            "Depending on severity, we may remove content, disable monetization, withhold or cancel irregularly obtained earnings, suspend or close the account and, where appropriate, inform the authorities.",
          ],
        },
        {
          title: "4. Reports",
          blocks: [`If you see content that breaks this policy, email ${o.email} with the video link and the reason. For copyright claims, use the procedure in the Copyright Policy.`],
        },
      ],
    },

    monetization: {
      title: "Monetization Program Terms",
      summary: "How creator earnings are calculated, reviewed and paid.",
      sections: [
        {
          title: "1. Eligibility",
          blocks: [
            {
              list: [
                "Be 18 or older and have an account in good standing.",
                "Monetization is always on for all your videos; it cannot be turned off, except where we suspend it under section 7.",
                "Verify your identity before your first payout.",
                "Not reside in countries or territories subject to sanctions that prevent us from paying you.",
              ],
            },
          ],
        },
        {
          title: "2. How earnings are calculated",
          blocks: [
            `We don’t pay a fixed rate. The program is a revenue share: at the end of each calendar month (UTC) we take the actual RPM our ad network reports for each country (revenue per 1,000 impressions) and credit you ${o.revenueSharePct}% of that value for every 1,000 monetized views your videos received from that country.`,
            `The total shared with creators in a month never exceeds ${o.revenueSharePct}% of the revenue we actually receive from the ad network for that month; if it would, every credit for that month is reduced by the same proportion. Estimates shown in your dashboard during the month are indicative and not a guaranteed amount.`,
            "We may change the revenue share percentage with advance notice; the change only applies to months closed afterwards.",
            "A view is monetized when the viewer plays the video for the minimum time shown in your dashboard without an ad blocker. Only one view per person and video every 24 hours counts, there is a daily limit per person, and bots and your own plays are excluded.",
            `Premium subscribers: they don't see ads, so their views generate no RPM revenue. Instead, when each month is closed we share ${o.premiumSharePct}% of the net Premium revenue attributable to that month (after PayPal fees; the yearly plan is spread evenly over its 12 months) in proportion to the full subscriber views each creator received, with the same minimum-duration and anti-fraud rules.`,
          ],
        },
        {
          title: "3. Invalid traffic",
          blocks: [
            "We do not pay for artificial or incentivised traffic, or traffic that violates the Acceptable Use Policy. Each month’s earnings are credited when the month is closed, after reviewing the traffic. If we detect invalid traffic, we may deduct the affected earnings, even after they appeared in your dashboard.",
          ],
        },
        {
          title: "4. Payouts",
          blocks: [
            {
              list: [
                `The minimum amount to request a payout is USD ${o.minPayoutUsd}. Some methods may have a higher minimum.`,
                "Payouts are requested from your dashboard for the full available balance and are processed after review, usually within 7 business days.",
                "You are responsible for providing correct payout details. The holder of the destination account must match your verified identity. We are not responsible for payouts sent to incorrect details you provided.",
                "Fees charged by your payment provider or the cryptocurrency network may reduce the amount received.",
              ],
            },
          ],
        },
        {
          title: "5. Identity verification",
          blocks: [
            "Before your first payout you must submit a valid identity document and a selfie holding it. We process this data encrypted and only to verify your identity, prevent fraud and comply with the law, as described in the Privacy Policy. We may reject the verification if the data is unreadable or does not match.",
          ],
        },
        {
          title: "6. Taxes",
          blocks: ["You are responsible for reporting and paying any taxes due on your earnings in your country. We may ask you for tax information where the law requires it."],
        },
        {
          title: "7. Suspension and program changes",
          blocks: [
            "We may suspend your participation and withhold pending earnings in cases of fraud or serious breach of our policies. We may change or end the program with advance notice; in that case, we will pay any valid balance above the minimum.",
          ],
        },
        {
          title: "8. Relationship between the parties",
          blocks: ["Joining the program does not create any employment, partnership or agency relationship between you and the operator."],
        },
      ],
    },
  };
}
