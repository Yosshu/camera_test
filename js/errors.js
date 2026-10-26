// カメラが使えない理由を、次に何をすればよいか分かる日本語の案内に変換する。

export function checkEnvironment() {
  if (!window.isSecureContext) {
    return {
      title: 'このページは HTTPS で開く必要があります',
      detail: 'カメラは安全な接続（https:// または localhost）でしか使えません。URL を確認してください。',
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      title: 'このブラウザはカメラに対応していません',
      detail: '最新の Chrome、Edge、Firefox、Safari でお試しください。',
    };
  }
  return null;
}

const MESSAGES = {
  NotAllowedError: {
    title: 'カメラの使用が許可されていません',
    detail: 'アドレスバーのカメラ（または鍵）のアイコンから、このサイトのカメラを「許可」に変更してページを再読み込みしてください。'
      + 'それでも使えない場合は、OS の「プライバシーとセキュリティ」→「カメラ」でブラウザにカメラの使用が許可されているか確認してください。',
  },
  NotFoundError: {
    title: 'カメラが見つかりません',
    detail: 'カメラが接続されているか、OS がカメラを認識しているか確認してください。',
  },
  NotReadableError: {
    title: 'カメラを起動できません',
    detail: 'ほかのアプリ（Zoom、Teams、OBS など）や別のタブがカメラを使っている可能性があります。'
      + 'それらを終了してからもう一度お試しください。カメラを挿し直すと直ることもあります。',
  },
  OverconstrainedError: {
    title: '指定した条件に合うカメラの設定がありません',
    detail: '条件を変えてもう一度お試しください。',
  },
  SecurityError: {
    title: 'セキュリティ上の理由でカメラを使えません',
    detail: 'ブラウザや OS の設定、または埋め込み元のページの設定によってカメラの使用が禁止されています。このページを直接開いてお試しください。',
  },
  AbortError: {
    title: 'カメラの起動が中断されました',
    detail: 'もう一度お試しください。',
  },
};

// 古いブラウザが使っていた名前
const ALIASES = {
  PermissionDeniedError: 'NotAllowedError',
  DevicesNotFoundError: 'NotFoundError',
  TrackStartError: 'NotReadableError',
  ConstraintNotSatisfiedError: 'OverconstrainedError',
};

export function describeError(error) {
  const name = ALIASES[error?.name] ?? error?.name;
  if (name === 'OverconstrainedError' && error.constraint === 'deviceId') {
    return {
      title: '選択したカメラが見つかりません',
      detail: 'カメラが取り外された可能性があります。一覧から選び直してください。',
    };
  }
  if (name === 'OverconstrainedError' && error.constraint === 'resizeMode') {
    return {
      title: 'このカメラでは縮小・切り抜きの禁止を指定できません',
      detail: '「ブラウザによる縮小・切り抜きをしない」をオフにしてお試しください。',
    };
  }
  return MESSAGES[name] ?? {
    title: 'カメラを起動できませんでした',
    detail: `予期しないエラーが発生しました（${error?.name ?? 'Error'}: ${error?.message ?? ''}）。ページを再読み込みしてお試しください。`,
  };
}
