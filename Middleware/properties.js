const handleOptionalParameters = (req, res, next) => {
  const tableName = req.tableName;
  const { $limit, $skip, $select, $range, $selectOr } = req.query;

  const limit = parseInt($limit) || 10;
  const skip = parseInt($skip) || 0;

  const selectFields = parseSelectParameters($select);
  const rangeFields = parseRangeParameters($range);
  const selectOrFields = parseSelectParameters($selectOr); // Parse $selectOr parameters

  const databaseQuery = buildDatabaseQuery({
    limit,
    skip,
    selectFields,
    rangeFields,
    selectOrFields,
    tableName,
  });

  req.databaseQuery = databaseQuery;

  next();
};

const buildDatabaseQuery = ({
  limit,
  skip,
  selectFields,
  rangeFields,
  selectOrFields,
  tableName,
}) => {
  const query = `SELECT * FROM ${tableName}`;
  const conditions = [];
  let orderBy = ["TimestampSql"];
  addSelectConditions(conditions, orderBy, selectFields);
  addSelectOrConditions(conditions, selectOrFields); // Add conditions for $selectOr
  addRangeConditions(conditions, rangeFields);
  return addLimitOffset(
    conditions.length
      ? `${query} WHERE ${conditions.join(" AND ")} ORDER BY ${orderBy[0]} DESC`
      : `${query} ORDER BY ${orderBy} DESC`,
    limit,
    skip
  );
};

const addSelectOrConditions = (conditions, selectOrFields) => {
  if (selectOrFields.length > 0) {
    const selectOrConditions = selectOrFields.map((field) => {
      const [fieldName, value] = field.split("=");
      return getConditionString(fieldName, value);
    });
    conditions.push(`(${selectOrConditions.join(" OR ")})`);
  }
};

const addSelectConditions = (conditions, orderBy, selectFields) => {
  selectFields.forEach((field) => {
    const [fieldName, value] = field.split("=");
    if (fieldName === "OrderBy" && value === "ListPrice") {
      console.log("orderby found");
      orderBy.pop();
      orderBy.push(`CAST(${value} AS FLOAT)`);
    } else {
      const condition = getConditionString(fieldName, value);
      conditions.push(condition);
    }
  });
};

const addRangeConditions = (conditions, rangeFields) => {
  const rangeValues = {};
  rangeFields.forEach((field) => {
    const [fieldName, value] = field.split("=");
    const match = fieldName.match(/^(min|max)/);

    if (match) {
      const minMaxType = match[0];
      const key = fieldName.substring(3);

      rangeValues[minMaxType] = rangeValues[minMaxType] || {};
      rangeValues[minMaxType][key] = parseInt(value);
    }
  });

  Object.entries(rangeValues).forEach(([minMaxType, values]) => {
    Object.entries(values).forEach(([key, value]) => {
      const operator = minMaxType === "min" ? ">=" : "<=";
      conditions.push(
        `CAST(${key} AS REAL) ${operator} CAST(${value} AS REAL)`
      );
    });
  });
};

const getConditionString = (fieldName, value) => {
  if (fieldName === "PriceDecreased" && value === "true") {
    return `CAST(MinListPrice AS REAL) = CAST(ListPrice AS REAL) AND CAST(MinListPrice AS REAL) < CAST(MaxListPrice AS REAL)`;
  }

  if (value === "true" || value === "false") {
    return `${fieldName} = ${value}`;
  }

  const stringValue = value.replace(/^'|'$/g, "");
  return `${fieldName} = '${stringValue}'`;
};

const addLimitOffset = (query, limit, skip) => {
  return query + ` LIMIT ${limit} OFFSET ${skip}`;
};

const parseSelectParameters = (select) => (select ? select.split(",") : []);

const parseRangeParameters = (range) => (range ? range.split(",") : []);

module.exports = {
  handleOptionalParameters,
};
