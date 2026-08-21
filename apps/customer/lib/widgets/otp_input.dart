import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme.dart';

/// A boxed OTP entry field. A single hidden [TextField] captures input while a
/// row of cells visualises each digit — robust across platforms without any
/// per-cell focus juggling.
class OtpInput extends StatefulWidget {
  const OtpInput({
    super.key,
    this.length = 6,
    this.controller,
    this.onChanged,
    this.onCompleted,
    this.autofocus = true,
  });

  final int length;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onCompleted;
  final bool autofocus;

  @override
  State<OtpInput> createState() => _OtpInputState();
}

class _OtpInputState extends State<OtpInput> {
  late final TextEditingController _controller;
  final FocusNode _focusNode = FocusNode();
  bool _ownsController = false;

  @override
  void initState() {
    super.initState();
    _controller = widget.controller ?? TextEditingController();
    _ownsController = widget.controller == null;
    _controller.addListener(_onChanged);
    _focusNode.addListener(_onFocusChanged);
  }

  void _onFocusChanged() => setState(() {});

  void _onChanged() {
    setState(() {});
    final String value = _controller.text;
    widget.onChanged?.call(value);
    if (value.length == widget.length) {
      widget.onCompleted?.call(value);
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onChanged);
    if (_ownsController) _controller.dispose();
    _focusNode.removeListener(_onFocusChanged);
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String text = _controller.text;
    final bool hasFocus = _focusNode.hasFocus;

    return Stack(
      children: <Widget>[
        // Hidden field that actually receives keystrokes.
        Opacity(
          opacity: 0,
          child: TextField(
            controller: _controller,
            focusNode: _focusNode,
            autofocus: widget.autofocus,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            maxLength: widget.length,
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(widget.length),
            ],
            decoration: const InputDecoration(counterText: '', border: InputBorder.none),
          ),
        ),
        GestureDetector(
          onTap: () => _focusNode.requestFocus(),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List<Widget>.generate(widget.length, (int i) {
              final bool filled = i < text.length;
              final bool active = hasFocus && i == text.length;
              return _Cell(
                digit: filled ? text[i] : '',
                active: active,
                filled: filled,
              );
            }),
          ),
        ),
      ],
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.digit, required this.active, required this.filled});

  final String digit;
  final bool active;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color border = active
        ? PigmeeColors.indigo
        : filled
            ? PigmeeColors.indigo.withValues(alpha: 0.4)
            : theme.colorScheme.outline.withValues(alpha: 0.5);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      width: 46,
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border, width: active ? 2 : 1.4),
      ),
      child: Text(
        digit,
        style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
    );
  }
}
