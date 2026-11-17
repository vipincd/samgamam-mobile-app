const { withAppBuildGradle } = require('expo/config-plugins');

const PLACEHOLDER_MARKER = '// Required by react-native-auth0 RedirectActivity.';

function applyAuth0AndroidPlaceholders(contents, { domain, customScheme }) {
  if (!domain || !customScheme) {
    throw new Error('Auth0 Android manifest placeholders require a domain and custom scheme.');
  }

  const defaultConfig = /(^[ \t]*defaultConfig[ \t]*\{)/m.exec(contents);
  if (!defaultConfig) {
    throw new Error('app/build.gradle has no defaultConfig block for Auth0 manifest placeholders.');
  }

  const indentation = `${defaultConfig[1].match(/^[ \t]*/)[0]}    `;
  const placeholderConfig = [
    `${indentation}${PLACEHOLDER_MARKER}`,
    `${indentation}manifestPlaceholders += [auth0Domain: ${JSON.stringify(domain)}, auth0Scheme: ${JSON.stringify(customScheme)}]`,
  ].join('\n');

  if (contents.includes(PLACEHOLDER_MARKER)) {
    return contents.replace(
      new RegExp(
        `^[ \\t]*${PLACEHOLDER_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[ \\t]*manifestPlaceholders\\s*\\+=\\s*\\[[^\\n]*\\]`,
        'm',
      ),
      placeholderConfig,
    );
  }

  return contents.replace(defaultConfig[1], `${defaultConfig[1]}\n${placeholderConfig}`);
}

function withAuth0AndroidPlaceholders(config, options) {
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = applyAuth0AndroidPlaceholders(
      modConfig.modResults.contents,
      options,
    );
    return modConfig;
  });
}

module.exports = withAuth0AndroidPlaceholders;
module.exports.applyAuth0AndroidPlaceholders = applyAuth0AndroidPlaceholders;
