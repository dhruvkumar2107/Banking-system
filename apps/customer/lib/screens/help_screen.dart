import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/theme.dart';
import '../l10n/strings.dart';
import '../widgets/section_card.dart';

/// Static help / FAQ / contact screen.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  static const String _supportPhone = '+91 1800 000 0000';
  static const String _supportEmail = 'support@digitalpigmee.example';

  Future<void> _launch(BuildContext context, Uri uri) async {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final AppStrings s = AppStrings.of(context);
    final bool ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(s.t('somethingWrong'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);

    final List<({String q, String a})> faqs = <({String q, String a})>[
      (q: s.t('faqQ1'), a: s.t('faqA1')),
      (q: s.t('faqQ2'), a: s.t('faqA2')),
      (q: s.t('faqQ3'), a: s.t('faqA3')),
      (q: s.t('faqQ4'), a: s.t('faqA4')),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(s.t('helpSupport'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            Text(
              s.t('faq'),
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: <Widget>[
                  for (int i = 0; i < faqs.length; i++)
                    ExpansionTile(
                      shape: const Border(),
                      collapsedShape: const Border(),
                      tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      expandedCrossAxisAlignment: CrossAxisAlignment.start,
                      leading: const Icon(Icons.help_outline_rounded, color: PigmeeColors.indigo),
                      title: Text(
                        faqs[i].q,
                        style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      children: <Widget>[
                        Text(
                          faqs[i].a,
                          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                        ),
                      ],
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SectionCard(
              title: s.t('contactUs'),
              padding: EdgeInsets.zero,
              child: Column(
                children: <Widget>[
                  ListTile(
                    leading: const Icon(Icons.phone_rounded, color: PigmeeColors.emerald),
                    title: Text(s.t('callUs')),
                    subtitle: const Text(_supportPhone),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => _launch(
                      context,
                      Uri(scheme: 'tel', path: _supportPhone.replaceAll(' ', '')),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.mail_rounded, color: PigmeeColors.indigo),
                    title: Text(s.t('emailUs')),
                    subtitle: const Text(_supportEmail),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => _launch(context, Uri(scheme: 'mailto', path: _supportEmail)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Center(
              child: Column(
                children: <Widget>[
                  Container(
                    height: 56,
                    width: 56,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: PigmeeColors.heroGradient),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(Icons.savings_rounded, color: Colors.white),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    s.t('appName'),
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${s.t('version')} 1.0.0',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
