const messages: Record<string, string> = {
  not_authenticated: "Войдите в UpGrade, чтобы продолжить.",
  invalid_credentials: "Неверная почта или пароль.",
  email_not_confirmed: "Подтвердите почту: ссылка пришла в письме после регистрации.",
  account_locked: "Слишком много попыток входа. Подождите несколько минут.",
  rate_limited: "Слишком много запросов. Повторите через минуту.",
  csrf_failed: "Сессия устарела. Обновите страницу.",
  origin_forbidden: "Запрос отклонён. Откройте UpGrade по основному адресу.",
  token_invalid: "Ссылка устарела или уже использована. Запросите новую.",
  consent_required: "Подтвердите согласие с условиями и на обработку персональных данных.",
  password_too_weak:
    "Пароль должен быть от 10 символов, не только из цифр и не совпадать с почтой.",
  oauth_state_invalid: "Вход не завершён: начните его заново.",
  oauth_signup_requires_consent:
    "Чтобы создать аккаунт через этот сервис, отметьте согласия на странице регистрации.",
  oauth_email_taken:
    "Аккаунт с этой почтой уже есть. Войдите по паролю и привяжите сервис в настройках.",
  oauth_identity_taken: "Этот аккаунт сервиса уже привязан к другому пользователю UpGrade.",
  oauth_failed: "Сервис входа не ответил. Повторите попытку.",
  oauth_provider_unknown: "Этот способ входа сейчас недоступен.",
  last_login_method: "Нельзя отвязать последний способ входа. Сначала задайте пароль.",
  subscription_inactive: "Подписка закончилась: данные доступны только для просмотра.",
  student_not_found: "Ученик не найден.",
  work_not_found: "Работа не найдена.",
  file_not_found: "Файл не найден.",
  revision_not_found: "Подтверждённый отчёт не найден.",
  draft_conflict: "Работа изменилась в другой вкладке. Обновите страницу, чтобы продолжить.",
  analysis_in_progress: "Дождитесь завершения обработки.",
  redaction_unchecked: "Перед разбором отметьте проверенными все страницы оригинала.",
  editing_closed: "Откройте новую редакцию работы.",
  closure_note_required: "Укажите основание закрытия пробела.",
  file_too_large: "Файл больше допустимого размера.",
  request_too_large: "Слишком большой объём файлов в одной работе.",
  file_type_unsupported: "Поддерживаются JPG, PNG и PDF.",
  file_unreadable: "Не удалось прочитать файл. Проверьте его и загрузите снова.",
  too_many_files: "Слишком много файлов в одной работе.",
  too_many_pages: "Слишком много страниц в одной работе.",
  attachments_mismatch: "Список файлов изменился. Обновите страницу.",
  storage_unavailable: "Хранилище файлов временно недоступно. Повторите позже.",
  draft_too_large: "Черновик слишком большой. Сократите текст разбора.",
  work_exists: "Работа с таким идентификатором уже существует.",
};

export function apiMessage(code: string, extra: Record<string, unknown> = {}): string {
  if (code === "review_blocked" && Array.isArray(extra.blockers) && extra.blockers.length)
    return String(extra.blockers[0]);
  return messages[code] ?? "Сервер не смог выполнить действие. Повторите попытку.";
}
