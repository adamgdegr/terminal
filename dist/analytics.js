// PostHog web analytics plus a small terminalAnalytics.track() wrapper.
// Local hosts and visitors who send Do Not Track / Global Privacy Control never
// load PostHog; their events stay in an in-memory log for debugging and tests.
(() => {
  'use strict';
  const projectKey = 'phc_mQRX57g2ZZk5LbEXSH5xuYeDAZFnniopdddwJFJk4Y8L';
  const apiHost = 'https://us.i.posthog.com';
  const location = window.location || {};
  const navigator = window.navigator || {};
  const local = location.protocol === 'file:' || /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\]|.*\.local)$/i.test(location.hostname || '');
  const optedOut = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const enabled = !local && !optedOut;
  const events = [];

  if (enabled) {
    // Official PostHog loader snippet (unchanged): queues calls until array.js loads.
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="uh dh fh ph yh init Gh Qh Bh Hh Yh tc Vh Xh Nh ad ld ud hd dd vd capture getExtension Jh mr Uh Wh calculateEventProperties pd register register_once register_for_session unregister unregister_for_session qh md getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys onActiveMatchingSurveysChanged renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync wd identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset kd shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty yd sd createPersonProfile setInternalOrTestUser bd kh opt_in_capturing opt_out_capturing wh has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing ed debug ec Fs getPageViewId captureTraceFeedback captureTraceMetric Oh".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    window.posthog.init(projectKey, {
      api_host: apiHost,
      defaults: '2026-05-30', // pageviews, page leaves (time on page), autocapture and web vitals
      person_profiles: 'identified_only',
      persistence: 'localStorage', // counts returning visitors without setting cookies
      respect_dnt: true
    });
  }

  function track(event, properties = {}, options) {
    const payload = { theme: window.terminalTheme?.current?.(), ...properties };
    events.push({ event, properties: payload });
    if (events.length > 50) events.shift();
    if (!enabled) return;
    try { window.posthog?.capture?.(event, payload, options); } catch { /* Analytics must never break the terminal. */ }
  }

  window.terminalAnalytics = { enabled, track, events };
})();
