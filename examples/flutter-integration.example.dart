/// Flutter Integration Example — awesome-node-auth
/// ----------------------------------------
/// Complete, copy-paste-ready Dart/Flutter client for awesome-node-auth backends.
///
/// Works on Android, iOS, Web (with minor adjustments — see notes).
///
/// Prerequisites:
///   flutter pub add http flutter_secure_storage flutter_web_auth_2
///
/// Covers:
///   1. AuthService  — login, logout, token refresh, register
///   2. Bearer token delivery (`X-Auth-Strategy: bearer`)
///   3. Secure token storage (flutter_secure_storage)
///   4. Automatic refresh interceptor
///   5. TOTP 2FA challenge
///   6. SMS OTP challenge
///   7. Magic-link flow
///   8. OAuth login (Google, GitHub, any provider) via in-app browser
///   9. OAuth + 2FA: extract tempToken from redirect URL → bearer 2FA verify
///  10. Change password
///  11. Change email (request + confirm)
///  12. Email verification (send + verify)
///  13. Account linking (link-request + link-verify)
///  14. List and unlink linked accounts
///  15. Admin panel API calls (for admin tooling apps)
///  16. Example widgets: LoginPage, TwoFactorPage, ProfilePage, LinkedAccountsPage

// ignore_for_file: avoid_print

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// ---------------------------------------------------------------------------
// 0. Configuration
// ---------------------------------------------------------------------------

const String kBaseUrl = 'https://your-api.example.com'; // ← change this

// ---------------------------------------------------------------------------
// 1. AuthService
// ---------------------------------------------------------------------------

/// Singleton service that manages JWT tokens and all auth API calls.
/// Uses [FlutterSecureStorage] on iOS (Keychain) and Android (EncryptedSharedPreferences).
class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  final _storage = const FlutterSecureStorage(
    // Android: EncryptedSharedPreferences (API 23+)
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    // iOS: Keychain with accessibility = after first unlock
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  // ---- Token helpers -------------------------------------------------------

  Future<String?> get accessToken => _storage.read(key: 'accessToken');
  Future<String?> get refreshToken => _storage.read(key: 'refreshToken');

  Future<void> _saveTokens(String access, String refresh) async {
    await _storage.write(key: 'accessToken', value: access);
    await _storage.write(key: 'refreshToken', value: refresh);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: 'accessToken');
    await _storage.delete(key: 'refreshToken');
  }

  // ---- Headers helper ------------------------------------------------------

  /// Returns headers for bearer-token requests.
  /// All requests from mobile use `X-Auth-Strategy: bearer` so tokens are
  /// returned in the JSON body instead of HttpOnly cookies.
  Map<String, String> get _bearerHeaders => {
    'Content-Type': 'application/json',
    'X-Auth-Strategy': 'bearer',
  };

  Future<Map<String, String>> _authHeaders() async {
    final token = await accessToken;
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // ---- Automatic token refresh ---------------------------------------------

  /// Wraps an authenticated request; if the server returns 401 it automatically
  /// refreshes the access token and retries once.
  Future<http.Response> _authedRequest(
    Future<http.Response> Function(Map<String, String> headers) fn,
  ) async {
    final headers = await _authHeaders();
    final res = await fn(headers);
    if (res.statusCode == 401) {
      final refreshed = await refreshTokens();
      if (refreshed) {
        final newHeaders = await _authHeaders();
        return fn(newHeaders);
      }
    }
    return res;
  }

  // ---- Registration --------------------------------------------------------

  /// POST /auth/register
  /// Body: { email, password, firstName?, lastName? }
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    String? firstName,
    String? lastName,
  }) async {
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/register'),
      headers: _bearerHeaders,
      body: jsonEncode({
        'email': email,
        'password': password,
        if (firstName != null) 'firstName': firstName,
        if (lastName != null) 'lastName': lastName,
      }),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 201 || res.statusCode == 200) {
      if (body['accessToken'] != null) {
        await _saveTokens(
          body['accessToken'] as String,
          body['refreshToken'] as String,
        );
      }
    }
    return body;
  }

  // ---- Login ---------------------------------------------------------------

  /// POST /auth/login
  /// Returns the JSON body (may include `tempToken` + `available2faMethods` for 2FA).
  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/login'),
      headers: _bearerHeaders,
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 200 && body['accessToken'] != null) {
      await _saveTokens(
        body['accessToken'] as String,
        body['refreshToken'] as String,
      );
    }
    return body;
  }

  // ---- Token refresh -------------------------------------------------------

  /// POST /auth/refresh
  /// Returns true if refresh succeeded.
  Future<bool> refreshTokens() async {
    final rt = await refreshToken;
    if (rt == null) return false;
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/refresh'),
      headers: _bearerHeaders,
      body: jsonEncode({'refreshToken': rt}),
    );
    if (res.statusCode == 200) {
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      await _saveTokens(
        body['accessToken'] as String,
        body['refreshToken'] as String,
      );
      return true;
    }
    return false;
  }

  // ---- Logout --------------------------------------------------------------

  /// POST /auth/logout (clears refresh token server-side) then wipes local storage.
  Future<void> logout() async {
    final headers = await _authHeaders();
    await http.post(Uri.parse('$kBaseUrl/auth/logout'), headers: headers);
    await clearTokens();
  }

  // ---- Profile -------------------------------------------------------------

  /// GET /auth/me
  Future<Map<String, dynamic>> getProfile() async {
    final res = await _authedRequest(
      (h) => http.get(Uri.parse('$kBaseUrl/auth/me'), headers: h),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ---- TOTP 2FA ------------------------------------------------------------

  /// POST /auth/2fa/verify
  /// Call after [login] returns `tempToken` and `available2faMethods` contains `'totp'`.
  Future<Map<String, dynamic>> verifyTotp({
    required String tempToken,
    required String totpCode,
  }) async {
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/2fa/verify'),
      headers: _bearerHeaders,
      body: jsonEncode({'tempToken': tempToken, 'totpCode': totpCode}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 200 && body['accessToken'] != null) {
      await _saveTokens(
        body['accessToken'] as String,
        body['refreshToken'] as String,
      );
    }
    return body;
  }

  // ---- SMS OTP 2FA ---------------------------------------------------------

  /// POST /auth/sms/send  (mode=2fa — sends OTP to the user's phone)
  Future<void> sendSms2fa({required String tempToken}) async {
    await http.post(
      Uri.parse('$kBaseUrl/auth/sms/send'),
      headers: _bearerHeaders,
      body: jsonEncode({'tempToken': tempToken, 'mode': '2fa'}),
    );
  }

  /// POST /auth/sms/verify  (mode=2fa — complete login with SMS code)
  Future<Map<String, dynamic>> verifySms2fa({
    required String tempToken,
    required String code,
  }) async {
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/sms/verify'),
      headers: _bearerHeaders,
      body: jsonEncode({'tempToken': tempToken, 'code': code, 'mode': '2fa'}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 200 && body['accessToken'] != null) {
      await _saveTokens(
        body['accessToken'] as String,
        body['refreshToken'] as String,
      );
    }
    return body;
  }

  // ---- Magic-link (passwordless) -------------------------------------------

  /// POST /auth/magic-link/send  (mode=login)
  Future<void> sendMagicLink({required String email}) async {
    await http.post(
      Uri.parse('$kBaseUrl/auth/magic-link/send'),
      headers: _bearerHeaders,
      body: jsonEncode({'email': email}),
    );
  }

  /// POST /auth/magic-link/verify  (mode=login)
  /// [token] is extracted from the deep-link URL: myapp://auth/magic-link?token=...
  Future<Map<String, dynamic>> verifyMagicLink({required String token}) async {
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/magic-link/verify'),
      headers: _bearerHeaders,
      body: jsonEncode({'token': token}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 200 && body['accessToken'] != null) {
      await _saveTokens(
        body['accessToken'] as String,
        body['refreshToken'] as String,
      );
    }
    return body;
  }

  // ---- OAuth login (Google, GitHub, any provider) --------------------------
  //
  // OAuth uses a browser redirect flow (not bearer). The server exposes:
  //   GET /auth/oauth/:name  → redirects to provider's authorization page
  //   GET /auth/oauth/:name/callback  → handles callback, then redirects to siteUrl
  //
  // On mobile we open the OAuth URL in the system browser (CustomTabs on Android,
  // SFSafariViewController on iOS) using flutter_web_auth_2.  The server must
  // set `siteUrl` in AuthConfig to your app's custom URL scheme so the redirect
  // lands back in the app.
  //
  // Server-side configuration:
  //   email: { siteUrl: 'myapp://auth' }
  //
  // After the OAuth callback the server either:
  //   a) Sets HttpOnly cookies + redirects to siteUrl  (no 2FA)
  //   b) Redirects to siteUrl/auth/2fa?tempToken=...&methods=...  (2FA required)
  //
  // In case (b) the app extracts tempToken + methods from the redirect URL and
  // completes login via the bearer-mode 2FA verify endpoint.
  //
  // NOTE: HttpOnly cookies set during the OAuth callback are in the system
  // browser session, NOT accessible to Flutter's http.Client.  For API calls
  // after OAuth always use the bearer flow (see loginWithOAuth below).

  /// Open the OAuth authorization page in the system browser.
  ///
  /// On success the browser redirects back to [callbackUrlScheme]://auth.
  /// If the server requires 2FA it redirects to
  ///   [callbackUrlScheme]://auth/auth/2fa?tempToken=...&methods=...
  ///
  /// Returns the landing URI (may contain tempToken for 2FA).
  Future<Uri?> _startOAuthFlow({
    required String provider,
    String callbackUrlScheme = 'myapp',
  }) async {
    final authUrl = '$kBaseUrl/auth/oauth/$provider';
    try {
      // Opens the system browser (CustomTabs / SFSafariViewController)
      // and waits for the redirect back to the custom scheme.
      final resultUrl = await FlutterWebAuth2.authenticate(
        url: authUrl,
        callbackUrlScheme: callbackUrlScheme,
      );
      return Uri.parse(resultUrl);
    } catch (e) {
      // User cancelled or error
      return null;
    }
  }

  /// Full OAuth login flow for any provider (Google, GitHub, Discord, etc.).
  ///
  /// Returns a result map:
  ///   { 'success': true }                         — logged in (tokens stored)
  ///   { 'requires2FA': true, 'tempToken': '...',
  ///     'available2faMethods': [...] }             — 2FA needed (call verify*)
  ///   { 'cancelled': true }                       — user cancelled
  ///
  /// Usage:
  ///   final result = await AuthService.instance.loginWithOAuth(provider: 'google');
  ///   if (result['requires2FA'] == true) {
  ///     // Navigate to TwoFactorPage with result['tempToken']
  ///   }
  Future<Map<String, dynamic>> loginWithOAuth({
    required String provider,
    String callbackUrlScheme = 'myapp',
  }) async {
    final resultUri = await _startOAuthFlow(
      provider: provider,
      callbackUrlScheme: callbackUrlScheme,
    );
    if (resultUri == null) return {'cancelled': true};

    // Check if the server redirected to the 2FA page
    // e.g. myapp://auth/auth/2fa?tempToken=xxx&methods=totp,sms
    if (resultUri.path.contains('/auth/2fa')) {
      final tempToken = resultUri.queryParameters['tempToken'];
      final methodsRaw = resultUri.queryParameters['methods'] ?? '';
      final methods = methodsRaw.isNotEmpty
          ? methodsRaw.split(',')
          : <String>[];
      return {
        'requires2FA': true,
        'tempToken': tempToken,
        'available2faMethods': methods,
      };
    }

    // No 2FA required — server redirected to siteUrl and set cookies in the
    // browser.  We call /auth/me via the bearer flow by requesting a new
    // token via a dedicated exchange endpoint (if available), or prompt the
    // user to log in again via the password flow.
    //
    // Simple approach: treat the OAuth redirect as "authenticated" and let
    // the app fall back to a password / magic-link login for API access.
    //
    // Recommended approach (server extension): implement a one-time token
    // endpoint that the server includes in the redirect:
    //   res.redirect(`${siteUrl}?ott=${oneTimeToken}`)
    // Then exchange it here:
    //   final ott = resultUri.queryParameters['ott'];
    //   if (ott != null) await _exchangeOtt(ott);
    //
    // The example below shows the simplest possible handling:
    return {
      'success': true,
      'note': 'Tokens set as HttpOnly cookies in browser session',
    };
  }

  // ---- OAuth 2FA completion ------------------------------------------------

  // After loginWithOAuth returns requires2FA=true, call the same TOTP/SMS
  // verify methods as for password-based 2FA, passing the tempToken:
  //
  //   final result = await AuthService.instance.loginWithOAuth(provider: 'google');
  //   if (result['requires2FA'] == true) {
  //     final tempToken = result['tempToken'] as String;
  //     // TOTP:
  //     final final = await AuthService.instance.verifyTotp(tempToken: tempToken, totpCode: code);
  //     // SMS (send first, then verify):
  //     await AuthService.instance.sendSms2fa(tempToken: tempToken);
  //     final final = await AuthService.instance.verifySms2fa(tempToken: tempToken, code: smsCode);
  //   }
  //
  // The bearer tokens are stored automatically on success (same as password login).

  /// POST /auth/forgot-password
  Future<void> forgotPassword({required String email}) async {
    await http.post(
      Uri.parse('$kBaseUrl/auth/forgot-password'),
      headers: _bearerHeaders,
      body: jsonEncode({'email': email}),
    );
  }

  /// POST /auth/reset-password
  Future<void> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    await http.post(
      Uri.parse('$kBaseUrl/auth/reset-password'),
      headers: _bearerHeaders,
      body: jsonEncode({'token': token, 'newPassword': newPassword}),
    );
  }

  /// POST /auth/change-password  (authenticated)
  Future<Map<String, dynamic>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final res = await _authedRequest(
      (h) => http.post(
        Uri.parse('$kBaseUrl/auth/change-password'),
        headers: h,
        body: jsonEncode({
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        }),
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ---- Email verification --------------------------------------------------

  /// POST /auth/send-verification-email  (authenticated)
  Future<void> sendVerificationEmail() async {
    await _authedRequest(
      (h) => http.post(
        Uri.parse('$kBaseUrl/auth/send-verification-email'),
        headers: h,
      ),
    );
  }

  /// GET /auth/verify-email?token=...
  /// [token] comes from the deep-link: myapp://auth/verify-email?token=...
  Future<Map<String, dynamic>> verifyEmail({required String token}) async {
    final res = await http.get(
      Uri.parse(
        '$kBaseUrl/auth/verify-email?token=${Uri.encodeComponent(token)}',
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ---- Change email --------------------------------------------------------

  /// POST /auth/change-email/request  (authenticated)
  Future<Map<String, dynamic>> changeEmailRequest({
    required String newEmail,
  }) async {
    final res = await _authedRequest(
      (h) => http.post(
        Uri.parse('$kBaseUrl/auth/change-email/request'),
        headers: h,
        body: jsonEncode({'newEmail': newEmail}),
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  /// POST /auth/change-email/confirm
  /// [token] comes from the deep-link: myapp://auth/change-email/confirm?token=...
  Future<Map<String, dynamic>> changeEmailConfirm({
    required String token,
  }) async {
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/change-email/confirm'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'token': token}),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ---- Account linking -----------------------------------------------------

  /// GET /auth/linked-accounts  (authenticated)
  Future<List<Map<String, dynamic>>> getLinkedAccounts() async {
    final res = await _authedRequest(
      (h) => http.get(Uri.parse('$kBaseUrl/auth/linked-accounts'), headers: h),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(body['linkedAccounts'] as List);
  }

  /// POST /auth/link-request  (authenticated)
  /// Sends a verification email to [email]; [provider] defaults to 'email'.
  Future<Map<String, dynamic>> linkRequest({
    required String email,
    String provider = 'email',
  }) async {
    final res = await _authedRequest(
      (h) => http.post(
        Uri.parse('$kBaseUrl/auth/link-request'),
        headers: h,
        body: jsonEncode({'email': email, 'provider': provider}),
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  /// POST /auth/link-verify
  /// [token] comes from the deep-link: myapp://auth/link-verify?token=...
  Future<Map<String, dynamic>> linkVerify({required String token}) async {
    final res = await http.post(
      Uri.parse('$kBaseUrl/auth/link-verify'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'token': token}),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  /// DELETE /auth/linked-accounts/:provider/:providerAccountId  (authenticated)
  Future<Map<String, dynamic>> unlinkAccount({
    required String provider,
    required String providerAccountId,
  }) async {
    final res = await _authedRequest(
      (h) => http.delete(
        Uri.parse(
          '$kBaseUrl/auth/linked-accounts/${Uri.encodeComponent(provider)}/${Uri.encodeComponent(providerAccountId)}',
        ),
        headers: h,
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ---- Account deletion ----------------------------------------------------

  /// DELETE /auth/account  (authenticated — permanent, irreversible)
  Future<void> deleteAccount() async {
    await _authedRequest(
      (h) => http.delete(Uri.parse('$kBaseUrl/auth/account'), headers: h),
    );
    await clearTokens();
  }
}

// ---------------------------------------------------------------------------
// 2. Deep-link handling
// ---------------------------------------------------------------------------
//
// Register a custom URL scheme in:
//   Android: android/app/src/main/AndroidManifest.xml
//     <!-- For OAuth redirect (flutter_web_auth_2) -->
//     <activity android:name="com.linusu.flutter_web_auth_2.CallbackActivity"
//               android:exported="true">
//       <intent-filter android:label="flutter_web_auth_2">
//         <action android:name="android.intent.action.VIEW" />
//         <category android:name="android.intent.category.DEFAULT" />
//         <category android:name="android.intent.category.BROWSABLE" />
//         <data android:scheme="myapp" />
//       </intent-filter>
//     </activity>
//     <!-- For email deep-links (app_links / uni_links) -->
//     <intent-filter>
//       <action android:name="android.intent.action.VIEW" />
//       <category android:name="android.intent.category.DEFAULT" />
//       <category android:name="android.intent.category.BROWSABLE" />
//       <data android:scheme="myapp" android:host="auth" />
//     </intent-filter>
//
//   iOS: ios/Runner/Info.plist
//     <key>CFBundleURLTypes</key>
//     <array><dict>
//       <key>CFBundleURLSchemes</key><array><string>myapp</string></array>
//     </dict></array>
//
// With app_links (or uni_links), handle incoming URIs for email confirmation
// deep-links (magic-link, verify-email, change-email, link-verify):
//
//   app_links.uriLinkStream.listen((uri) {
//     if (uri.host == 'auth') {
//       final token = uri.queryParameters['token'];
//       if (token == null) return;
//       switch (uri.path) {
//         case '/verify-email':
//           AuthService.instance.verifyEmail(token: token); break;
//         case '/change-email/confirm':
//           AuthService.instance.changeEmailConfirm(token: token); break;
//         case '/magic-link':
//           AuthService.instance.verifyMagicLink(token: token); break;
//         case '/link-verify':
//           AuthService.instance.linkVerify(token: token); break;
//       }
//     }
//   });
//
// OAuth redirects are handled automatically by flutter_web_auth_2 inside
// AuthService.loginWithOAuth() — no manual deep-link handling needed.
//
// NOTE: Configure siteUrl in AuthConfig on the server to point to your scheme:
//   email: { siteUrl: 'myapp://auth' }
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. Example Widgets
// ---------------------------------------------------------------------------

/// Simple login page demonstrating the full bearer flow including 2FA.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _auth = AuthService.instance;
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String _status = '';

  Future<void> _login() async {
    setState(() => _status = 'Logging in…');
    try {
      final result = await _auth.login(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      if (result['accessToken'] != null) {
        // Successful direct login (no 2FA)
        setState(() => _status = 'Logged in ✓');
        if (mounted) Navigator.pushReplacementNamed(context, '/profile');
      } else if (result['tempToken'] != null) {
        // 2FA required
        final methods = List<String>.from(
          result['available2faMethods'] as List,
        );
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => TwoFactorPage(
                tempToken: result['tempToken'] as String,
                availableMethods: methods,
              ),
            ),
          );
        }
      } else {
        setState(() => _status = result['error'] as String? ?? 'Login failed');
      }
    } catch (e) {
      setState(() => _status = 'Error: $e');
    }
  }

  Future<void> _loginWithOAuth(String provider) async {
    setState(() => _status = 'Opening $provider…');
    try {
      final result = await _auth.loginWithOAuth(provider: provider);
      if (result['cancelled'] == true) {
        setState(() => _status = '');
      } else if (result['requires2FA'] == true) {
        final tempToken = result['tempToken'] as String;
        final methods = List<String>.from(
          result['available2faMethods'] as List? ?? [],
        );
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => TwoFactorPage(
                tempToken: tempToken,
                availableMethods: methods,
              ),
            ),
          );
        }
      } else if (result['success'] == true) {
        setState(() => _status = 'OAuth login successful');
        if (mounted) Navigator.pushReplacementNamed(context, '/profile');
      } else {
        setState(
          () => _status = result['error'] as String? ?? 'OAuth login failed',
        );
      }
    } catch (e) {
      setState(() => _status = 'Error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            TextField(
              controller: _emailCtrl,
              decoration: const InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
            ),
            TextField(
              controller: _passwordCtrl,
              decoration: const InputDecoration(labelText: 'Password'),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _login, child: const Text('Login')),
            const SizedBox(height: 8),
            const Text(
              '— or continue with —',
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              icon: const Icon(Icons.login),
              label: const Text('Google'),
              onPressed: () => _loginWithOAuth('google'),
            ),
            OutlinedButton.icon(
              icon: const Icon(Icons.code),
              label: const Text('GitHub'),
              onPressed: () => _loginWithOAuth('github'),
            ),
            if (_status.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_status),
            ],
          ],
        ),
      ),
    );
  }
}

/// 2FA challenge page — handles TOTP and SMS.
class TwoFactorPage extends StatefulWidget {
  final String tempToken;
  final List<String> availableMethods;
  const TwoFactorPage({
    super.key,
    required this.tempToken,
    required this.availableMethods,
  });
  @override
  State<TwoFactorPage> createState() => _TwoFactorPageState();
}

class _TwoFactorPageState extends State<TwoFactorPage> {
  final _auth = AuthService.instance;
  final _codeCtrl = TextEditingController();
  String _status = '';
  bool _smsSent = false;

  Future<void> _sendSms() async {
    await _auth.sendSms2fa(tempToken: widget.tempToken);
    setState(() {
      _smsSent = true;
      _status = 'SMS sent';
    });
  }

  Future<void> _verifyTotp() async {
    final result = await _auth.verifyTotp(
      tempToken: widget.tempToken,
      totpCode: _codeCtrl.text.trim(),
    );
    _handleResult(result);
  }

  Future<void> _verifySms() async {
    final result = await _auth.verifySms2fa(
      tempToken: widget.tempToken,
      code: _codeCtrl.text.trim(),
    );
    _handleResult(result);
  }

  void _handleResult(Map<String, dynamic> result) {
    if (result['accessToken'] != null) {
      if (mounted) Navigator.pushReplacementNamed(context, '/profile');
    } else {
      setState(
        () => _status = result['error'] as String? ?? 'Verification failed',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasTotp = widget.availableMethods.contains('totp');
    final hasSms = widget.availableMethods.contains('sms');
    return Scaffold(
      appBar: AppBar(title: const Text('Two-Factor Authentication')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            if (hasTotp) ...[
              const Text('Enter the 6-digit code from your authenticator app:'),
              TextField(
                controller: _codeCtrl,
                keyboardType: TextInputType.number,
                maxLength: 6,
              ),
              ElevatedButton(
                onPressed: _verifyTotp,
                child: const Text('Verify TOTP'),
              ),
            ],
            if (hasSms) ...[
              const SizedBox(height: 16),
              if (!_smsSent)
                ElevatedButton(
                  onPressed: _sendSms,
                  child: const Text('Send SMS code'),
                ),
              if (_smsSent) ...[
                const Text('Enter the SMS code:'),
                TextField(
                  controller: _codeCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                ),
                ElevatedButton(
                  onPressed: _verifySms,
                  child: const Text('Verify SMS'),
                ),
              ],
            ],
            if (_status.isNotEmpty) Text(_status),
          ],
        ),
      ),
    );
  }
}

/// Profile page showing user details and linked accounts.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _auth = AuthService.instance;
  Map<String, dynamic>? _profile;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final profile = await _auth.getProfile();
    if (mounted) setState(() => _profile = profile);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await _auth.logout();
              if (mounted) Navigator.pushReplacementNamed(context, '/login');
            },
          ),
        ],
      ),
      body: _profile == null
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Email: ${_profile!['email']}'),
                  Text('Provider: ${_profile!['loginProvider'] ?? 'local'}'),
                  if (_profile!['isEmailVerified'] == true)
                    const Text('✅ Email verified')
                  else
                    TextButton(
                      onPressed: () async {
                        await _auth.sendVerificationEmail();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Verification email sent'),
                          ),
                        );
                      },
                      child: const Text('Verify email'),
                    ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => const LinkedAccountsPage(),
                      ),
                    ),
                    child: const Text('Manage linked accounts'),
                  ),
                ],
              ),
            ),
    );
  }
}

/// Linked accounts page: list, link new address, unlink existing.
class LinkedAccountsPage extends StatefulWidget {
  const LinkedAccountsPage({super.key});
  @override
  State<LinkedAccountsPage> createState() => _LinkedAccountsPageState();
}

class _LinkedAccountsPageState extends State<LinkedAccountsPage> {
  final _auth = AuthService.instance;
  final _emailCtrl = TextEditingController();
  List<Map<String, dynamic>> _accounts = [];
  String _status = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final accounts = await _auth.getLinkedAccounts();
    if (mounted) setState(() => _accounts = accounts);
  }

  Future<void> _linkRequest() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) return;
    final result = await _auth.linkRequest(email: email);
    setState(() {
      _status = result['success'] == true
          ? 'Verification email sent to $email'
          : result['error'] as String? ?? 'Error';
    });
  }

  Future<void> _unlink(Map<String, dynamic> account) async {
    await _auth.unlinkAccount(
      provider: account['provider'] as String,
      providerAccountId: account['providerAccountId'] as String,
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Linked Accounts')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Linked accounts:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            ..._accounts.map(
              (a) => ListTile(
                title: Text(a['provider'] as String),
                subtitle: Text(
                  a['email'] as String? ?? a['providerAccountId'] as String,
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.link_off),
                  onPressed: () => _unlink(a),
                ),
              ),
            ),
            const Divider(),
            const Text('Link a new email address:'),
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email to link'),
            ),
            ElevatedButton(
              onPressed: _linkRequest,
              child: const Text('Send link request'),
            ),
            if (_status.isNotEmpty) Text(_status),
            const SizedBox(height: 8),
            const Text(
              'After sending, the user will receive a confirmation email.\n'
              'Opening the link in the app (via deep-link) will call linkVerify().',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 4. App entry point
// ---------------------------------------------------------------------------

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'awesome-node-auth Flutter demo',
      initialRoute: '/login',
      routes: {
        '/login': (_) => const LoginPage(),
        '/profile': (_) => const ProfilePage(),
      },
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Admin REST API (for admin tooling / back-office Flutter apps)
// ---------------------------------------------------------------------------
//
// Use the same bearer pattern with the admin secret:
//
//   final adminHeaders = {
//     'Content-Type': 'application/json',
//     'Authorization': 'Bearer $adminSecret',
//   };
//
//   // List users
//   final res = await http.get(
//     Uri.parse('$kBaseUrl/admin/api/users?limit=20&offset=0'),
//     headers: adminHeaders,
//   );
//
//   // Get user linked accounts (requires linkedAccountsStore on server)
//   final la = await http.get(
//     Uri.parse('$kBaseUrl/admin/api/users/$userId/linked-accounts'),
//     headers: adminHeaders,
//   );
//
//   // Delete a user
//   await http.delete(
//     Uri.parse('$kBaseUrl/admin/api/users/$userId'),
//     headers: adminHeaders,
//   );
//
// The admin panel itself (the web UI) is served at /admin/ and is designed for
// browser use. For Flutter admin tooling, call the /admin/api/* REST endpoints
// directly as shown above.

// ---------------------------------------------------------------------------
// 6. Android-specific notes
// ---------------------------------------------------------------------------
//
// • flutter_secure_storage uses EncryptedSharedPreferences on Android API 23+.
//   For API < 23 (very rare — Android 5.x), fall back to KeyStore-backed storage:
//     aOptions: AndroidOptions(encryptedSharedPreferences: false)
//
// • Deep-link handling: add the intent-filter for your scheme in
//   android/app/src/main/AndroidManifest.xml (see section 2 above).
//
// • flutter_web_auth_2 uses Chrome Custom Tabs for OAuth on Android.
//   Add the CallbackActivity entry to AndroidManifest.xml (see section 2).
//
// • For App Links (HTTPS deep-links with domain verification):
//   https://developer.android.com/training/app-links/verify-android-applinks

// ---------------------------------------------------------------------------
// 7. iOS-specific notes
// ---------------------------------------------------------------------------
//
// • flutter_secure_storage uses the iOS Keychain automatically.
//   Choose KeychainAccessibility.first_unlock (default above) so tokens
//   survive device restarts without an immediate unlock.
//
// • Deep-link handling: register your URL scheme in ios/Runner/Info.plist
//   (see section 2 above) and set LSApplicationQueriesSchemes if needed.
//
// • flutter_web_auth_2 uses SFAuthenticationSession / ASWebAuthenticationSession
//   for OAuth on iOS — no extra Info.plist changes required beyond the URL scheme.
//
// • For Universal Links (HTTPS domain-associated deep-links):
//   https://developer.apple.com/documentation/xcode/supporting-universal-links
