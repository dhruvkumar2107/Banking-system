import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/config.dart';
import '../data/api_exception.dart';
import '../data/models/village.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/auth_controller.dart';
import '../state/data_providers.dart';
import '../widgets/primary_button.dart';
import '../widgets/state_views.dart';

/// Navigation arguments for [RegisterScreen].
class RegisterArgs {
  const RegisterArgs({required this.registrationToken, required this.mobile});
  final String registrationToken;
  final String mobile;
}

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, required this.args});
  final RegisterArgs args;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _address = TextEditingController();
  final TextEditingController _customAmount = TextEditingController();

  Village? _village;
  int _dailyAmount = AppConfig.defaultDailyRupees;
  bool _customSelected = false;
  bool _loading = false;

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    _customAmount.dispose();
    super.dispose();
  }

  int? get _effectiveAmount {
    if (_customSelected) {
      final int? v = int.tryParse(_customAmount.text.trim());
      return (v != null && v > 0) ? v : null;
    }
    return _dailyAmount;
  }

  Future<void> _submit() async {
    final AppStrings s = AppStrings.of(context);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_village == null) {
      _showError(s.t('villageRequired'));
      return;
    }
    final int? amount = _effectiveAmount;
    if (amount == null) {
      _showError(s.t('amountRequired'));
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    try {
      await ref.read(authControllerProvider.notifier).register(
            registrationToken: widget.args.registrationToken,
            name: _name.text.trim(),
            villageId: _village!.id,
            address: _address.text.trim(),
            dailyAmountRupees: amount,
          );
      if (!mounted) return;
      // Auth state flipped → router redirect handles it, but be explicit.
      context.go(Routes.home);
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final AsyncValue<List<Village>> villages = ref.watch(villagesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('createAccount'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  s.t('registerSubtitle'),
                  style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 24),

                // Name
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: s.t('fullName'),
                    hintText: s.t('nameHint'),
                    prefixIcon: const Icon(Icons.person_rounded),
                  ),
                  validator: (String? v) =>
                      (v == null || v.trim().length < 2) ? s.t('nameRequired') : null,
                ),
                const SizedBox(height: 16),

                // Address (optional)
                TextFormField(
                  controller: _address,
                  textCapitalization: TextCapitalization.sentences,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: '${s.t('address')} (${s.t('optional')})',
                    hintText: s.t('addressHint'),
                    prefixIcon: const Icon(Icons.home_rounded),
                  ),
                ),
                const SizedBox(height: 16),

                // Village picker with search
                villages.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: LinearProgressIndicator(),
                  ),
                  error: (Object e, _) => ErrorView(
                    compact: true,
                    message: e is ApiException ? e.message : s.t('somethingWrong'),
                    onRetry: () => ref.invalidate(villagesProvider),
                  ),
                  data: (List<Village> list) => _VillagePicker(
                    villages: list,
                    selected: _village,
                    onChanged: (Village? v) => setState(() => _village = v),
                    labelText: s.t('selectVillage'),
                  ),
                ),
                const SizedBox(height: 24),

                // Daily amount
                Text(
                  s.t('dailyDeposit'),
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  s.t('dailyDepositHelp'),
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: <Widget>[
                    ...AppConfig.dailyAmountPresets.map((int amt) {
                      final bool selected = !_customSelected && _dailyAmount == amt;
                      return ChoiceChip(
                        label: Text('₹$amt'),
                        selected: selected,
                        onSelected: (_) => setState(() {
                          _customSelected = false;
                          _dailyAmount = amt;
                        }),
                      );
                    }),
                    ChoiceChip(
                      label: Text(s.t('customAmount')),
                      selected: _customSelected,
                      onSelected: (_) => setState(() => _customSelected = true),
                    ),
                  ],
                ),
                if (_customSelected) ...<Widget>[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _customAmount,
                    keyboardType: TextInputType.number,
                    inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: s.t('customAmount'),
                      prefixText: '₹ ',
                      prefixIcon: const Icon(Icons.currency_rupee_rounded),
                    ),
                  ),
                ],
                const SizedBox(height: 32),
                PrimaryButton(
                  label: s.t('completeRegistration'),
                  icon: Icons.check_rounded,
                  loading: _loading,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A village picker with search functionality grouped by district and taluk.
class _VillagePicker extends StatefulWidget {
  const _VillagePicker({
    required this.villages,
    required this.selected,
    required this.onChanged,
    required this.labelText,
  });

  final List<Village> villages;
  final Village? selected;
  final ValueChanged<Village?> onChanged;
  final String labelText;

  @override
  State<_VillagePicker> createState() => _VillagePickerState();
}

class _VillagePickerState extends State<_VillagePicker> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<Village> get _filteredVillages {
    if (_searchQuery.isEmpty) return widget.villages;
    final query = _searchQuery.toLowerCase();
    return widget.villages.where((v) {
      return v.name.toLowerCase().contains(query) ||
          v.code.toLowerCase().contains(query) ||
          v.district.toLowerCase().contains(query) ||
          v.taluk.toLowerCase().contains(query);
    }).toList();
  }

  Map<String, Map<String, List<Village>>> get _groupedVillages {
    final Map<String, Map<String, List<Village>>> grouped = {};
    for (final village in _filteredVillages) {
      final district = village.district;
      final taluk = village.taluk;
      grouped.putIfAbsent(district, () => {});
      grouped[district]!.putIfAbsent(taluk, () => []);
      grouped[district]![taluk]!.add(village);
    }
    // Sort districts and taluks
    final sortedGrouped = Map<String, Map<String, List<Village>>>.from(
      Map.fromEntries(
        grouped.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
      ),
    );
    for (final district in sortedGrouped.keys) {
      sortedGrouped[district] = Map<String, List<Village>>.from(
        Map.fromEntries(
          sortedGrouped[district]!.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
        ),
      );
    }
    return sortedGrouped;
  }

  void _showVillagePicker() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => Column(
          children: [
            // Handle bar
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Search bar
            Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search village, district, or taluk...',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchQuery.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _searchQuery = '');
                          },
                        )
                      : null,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onChanged: (value) => setState(() => _searchQuery = value),
              ),
            ),
            // Village list
            Expanded(
              child: _filteredVillages.isEmpty
                  ? const Center(child: Text('No villages found'))
                  : ListView.builder(
                      controller: scrollController,
                      itemCount: _buildListItemCount(),
                      itemBuilder: (context, index) => _buildListItem(index),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  int _buildListItemCount() {
    int count = 0;
    final grouped = _groupedVillages;
    for (final district in grouped.keys) {
      count++; // District header
      for (final taluk in grouped[district]!.keys) {
        count++; // Taluk header
        count += grouped[district]![taluk]!.length; // Villages
      }
    }
    return count;
  }

  Widget _buildListItem(int index) {
    final grouped = _groupedVillages;
    int currentIndex = 0;

    for (final district in grouped.keys) {
      if (currentIndex == index) {
        return _buildDistrictHeader(district);
      }
      currentIndex++;

      for (final taluk in grouped[district]!.keys) {
        if (currentIndex == index) {
          return _buildTalukHeader(taluk);
        }
        currentIndex++;

        final villages = grouped[district]![taluk]!;
        for (final village in villages) {
          if (currentIndex == index) {
            return _buildVillageTile(village);
          }
          currentIndex++;
        }
      }
    }

    return const SizedBox.shrink();
  }

  Widget _buildDistrictHeader(String district) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Theme.of(context).colorScheme.primaryContainer.withOpacity(0.3),
      child: Row(
        children: [
          Icon(Icons.location_city, size: 18, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Text(
            district,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTalukHeader(String taluk) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.3),
      child: Row(
        children: [
          Icon(Icons.map, size: 16, color: Theme.of(context).colorScheme.secondary),
          const SizedBox(width: 8),
          Text(
            taluk,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: Theme.of(context).colorScheme.secondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVillageTile(Village village) {
    final isSelected = widget.selected?.id == village.id;
    return ListTile(
      title: Text(village.name),
      subtitle: Text('${village.district} • ${village.taluk}'),
      trailing: isSelected
          ? Icon(Icons.check_circle, color: Theme.of(context).colorScheme.primary)
          : null,
      onTap: () {
        widget.onChanged(village);
        Navigator.of(context).pop();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.labelText,
          style: TextStyle(
            fontSize: 12,
            color: Theme.of(context).colorScheme.outline,
          ),
        ),
        const SizedBox(height: 4),
        InkWell(
          onTap: _showVillagePicker,
          borderRadius: BorderRadius.circular(12),
          child: InputDecorator(
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.location_on_rounded),
              suffixIcon: const Icon(Icons.arrow_drop_down),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: widget.selected != null
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              widget.selected!.name,
                              style: const TextStyle(fontWeight: FontWeight.w500),
                            ),
                            Text(
                              '${widget.selected!.district} • ${widget.selected!.taluk}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Theme.of(context).colorScheme.outline,
                              ),
                            ),
                          ],
                        )
                      : Text(
                          'Select your village',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.outline,
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
