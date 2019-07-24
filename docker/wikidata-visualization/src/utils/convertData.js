// convert the result from Wikidata to objects
import * as d3 from 'd3'
import { getColorScaleFromValues, getColors, colorSchemes } from './scales'
import { getCommonsFileName } from './commons'
import moment from 'moment'
import toposort from 'toposort'

const numbers = [
  'double',
  'float',
  'decimal',
  'integer',
  'long',
  'int',
  'short',
  'nonNegativeInteger',
  'positiveInteger',
  'unsignedLong',
  'unsignedInt',
  'unsignedShort',
  'nonPositiveInteger',
  'negativeInteger'
]

const numberTypes = numbers.map(
  type => `http://www.w3.org/2001/XMLSchema#${type}`
)

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif']

// return converted value and data type associated with this value
function convertValue(value) {
  if (numberTypes.includes(value['datatype'])) {
    return [parseFloat(value['value']), 'number'] // number
  } else if (value['value'].startsWith('http://www.wikidata.org/entity/')) {
    return [value['value'].substr(31), 'item'] // Wikidata item
  } else if (
    value['datatype'] === 'http://www.opengis.net/ont/geosparql#wktLiteral'
  ) {
    // for non-Earth coordinates, the entity is present before point
    return [
      `(${value['value']
        .slice(value['value'].toLowerCase().indexOf('point') + 6, -1)
        .split(' ')
        .join(', ')})`,
      'coordinate'
    ] // coordinate
  } else if (
    value['value'].startsWith(
      'http://commons.wikimedia.org/wiki/Special:FilePath'
    ) &&
    imageExtensions.includes(
      value['value']
        .slice(value['value'].match(/\.[^.]*$/).index + 1)
        .toLowerCase()
    )
  ) {
    return [getCommonsFileName(value['value']), 'image']
  } else if (
    value['value'].startsWith(
      'http://commons.wikimedia.org/wiki/Special:FilePath'
    )
  ) {
    return [getCommonsFileName(value['value']), 'commons']
  } else if (
    value['datatype'] === 'http://www.w3.org/2001/XMLSchema#dateTime'
  ) {
    return [value['value'], 'time']
  } else if (value['datatype'] === 'http://www.w3.org/1998/Math/MathML') {
    return [value['value'], 'formula']
  } else if (value.type === 'uri') {
    return [value['value'], 'url']
  } else if (value['value'].startsWith('http')) {
    return [value['value'], 'url']
  } else {
    return [value['value'], 'string']
  }
}

export function convertData(header, data) {
  // will store data types into this array
  let data_types = Array(header.length).fill('')

  const new_data = data.map(item => {
    let simplified_item = Object.keys(item).reduce((prev, current) => {
      ;[prev[current], data_types[header.indexOf(current)]] = convertValue(
        item[current]
      )
      return prev
    }, {})
    return simplified_item
  })

  return [new_data, data_types]
}

// find indices of a given data type
export function getDataTypeIndices(dataTypes, currentDataType) {
  return dataTypes
    .map((type, i) => (type === currentDataType ? i : ''))
    .filter(String)
}

// get tree relationships (child-parent pairs) from data
export function getTreeRoot(props) {
  const from = props.header[props.settings['link-from']]
  const to = props.header[props.settings['link-to']]
  const label = props.header[props.settings['label']]
  const color = props.header[props.settings['color']]
  const radius = props.header[props.settings['radius']]

  let relationships = []
  let ids = []

  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )

  const allFromIds = selectedData.map(item => item[from])

  selectedData.forEach((item, index) => {
    if (item[to]) {
      // do not add duplicates and make sure the child has its own row
      // (perhaps same child with different parents could be added as two different nodes)
      if (!ids.includes(item[to]) && allFromIds.indexOf(item[to]) >= 0) {
        relationships.push({
          id: item[to],
          index: index,
          parent: item[from],
          label: label ? selectedData[allFromIds.indexOf(item[to])][label] : '',
          color: color ? selectedData[allFromIds.indexOf(item[to])][color] : '',
          radius: radius
            ? selectedData[allFromIds.indexOf(item[to])][radius]
            : 1,
          tooltipHTML: getSingleTooltipHTML(item, props.header)
        })
        ids.push(item[to])
      }
    }
  })

  // use toposort to find the root node
  let sorted
  try {
    sorted = toposort(relationships.map(r => [r.parent, r.id]))
  } catch (err) {
    return null
  }

  // add root node
  relationships.push({
    id: sorted[0],
    parent: '',
    label: label ? selectedData[allFromIds.indexOf(sorted[0])][label] : '',
    color: color ? selectedData[allFromIds.indexOf(sorted[0])][color] : ''
  })

  try {
    const stratify = d3
      .stratify()
      .id(function(d) {
        return d['id']
      })
      .parentId(function(d) {
        return d['parent']
      })
    const root = stratify(relationships)
    return root
  } catch (err) {
    return null
  }
}

// get matrix (rows and columns are the same) for chord diagram
export function getMatrix(props) {
  const from = props.header[props.settings['link-from']]
  const to = props.header[props.settings['link-to']]
  const relation = props.header[props.settings['relation']]
  const label = props.header[props.settings['label']]

  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )

  const parseData =
    props.dataTypes[props.settings['relation']] === 'number'
      ? parseFloat
      : d => moment(d).year() + moment(d).dayOfYear() / 366 // convert date to year

  const items = [
    ...new Set(
      selectedData
        .map(item => item[from])
        .concat(selectedData.map(item => item[to]))
    )
  ].sort()
  // create empty matrix
  let matrix = items.map(item => items.map(item => 0))

  const labels = Array(items.length).fill('')
  let tooltipHTMLs = JSON.parse(JSON.stringify(matrix)) // deep copy

  // fill data into the matrix
  selectedData.forEach(item => {
    const fromIndex = items.indexOf(item[from])
    const toIndex = items.indexOf(item[to])
    matrix[fromIndex][toIndex] += parseData(item[relation])
    if (label) labels[fromIndex] = item[label]
    tooltipHTMLs[fromIndex][toIndex] = getSingleTooltipHTML(item, props.header)
  })

  let colorScale = getColorScaleFromValues(items, props.moreSettings.color)
  const colors = items.map(item => colorScale(item))

  // for legend
  if (label != null) colorScale = colorScale.domain(labels)

  return [matrix, colorScale, colors, labels, tooltipHTMLs]
}

// get matrix (rows and columns are not the same in general) for heat map
export function getMatrix2(props) {
  const from = props.header[props.settings['link-from']]
  const to = props.header[props.settings['link-to']]
  const label_from = props.header[props.settings['label_from']]
  const label_to = props.header[props.settings['label_to']]
  const sort_row = props.moreSettings.sortRow
  const sort_col = props.moreSettings.sortColumn

  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )

  const [colors, colorScale] = getColors(props, true)

  const maxItem = (a, b) => {
    if (typeof a === 'number' || typeof b === 'number') {
      return a > b ? a : b
    } else {
      return a != null ? a : b
    }
  }

  let row_items = [...new Set(selectedData.map(item => item[from]))]
  let col_items = [...new Set(selectedData.map(item => item[to]))]

  // sort row and column
  let row_valToBeSorted = row_items.map(row_item => null)
  let col_valToBeSorted = col_items.map(col_item => null)

  selectedData.forEach((item, i) => {
    const rowIndex = row_items.indexOf(item[from])
    const colIndex = col_items.indexOf(item[to])
    row_valToBeSorted[rowIndex] = maxItem(
      row_valToBeSorted[rowIndex],
      item[sort_row]
    )
    col_valToBeSorted[colIndex] = maxItem(
      col_valToBeSorted[colIndex],
      item[sort_col]
    )
  })

  const row_indices = [...row_items.keys()].sort((a, b) => {
    return row_valToBeSorted[a] < row_valToBeSorted[b] ? -1 : 1
  })
  const col_indices = [...col_items.keys()].sort((a, b) => {
    return col_valToBeSorted[a] < col_valToBeSorted[b] ? -1 : 1
  })

  row_items = row_indices.map(i => row_items[i])
  col_items = col_indices.map(i => col_items[i])

  // initialize labels
  let row_labels = row_items.map(row_item => '')
  let col_labels = col_items.map(col_item => '')

  // initialize matrix
  let matrix = row_items.map((row_item, i) =>
    col_items.map(col_item => ({
      color: 'white',
      row: i
    }))
  )

  selectedData.forEach((item, i) => {
    const rowIndex = row_items.indexOf(item[from])
    const colIndex = col_items.indexOf(item[to])
    matrix[rowIndex][colIndex] = {
      color: colors[i],
      row: rowIndex,
      tooltipHTML: getSingleTooltipHTML(item, props.header)
    }
    row_labels[rowIndex] = item[label_from]
    col_labels[colIndex] = item[label_to]
  })

  return [matrix, row_labels, col_labels, colorScale]
}

export function getGraph(props, link_index = false) {
  // link_index: use index or Qid for sources/targets
  const from = props.header[props.settings['link-from']]
  const to = props.header[props.settings['link-to']]
  const label_from = props.header[props.settings['label_from']]
  const label_to = props.header[props.settings['label_to']]
  const edge_label = props.header[props.settings['edge_label']]
  const relation = props.header[props.settings['relation']]
  const color_from = props.header[props.settings['color_from']]
  const color_to = props.header[props.settings['color_to']]

  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )

  const parseData =
    props.dataTypes[props.settings['relation']] === 'number'
      ? parseFloat
      : d => moment(d).year() + moment(d).dayOfYear() / 366 // convert date to year

  // nodes
  const items = [
    ...new Set(
      selectedData
        .map(item => item[from])
        .concat(selectedData.map(item => item[to]))
    )
  ]
  const nodes = items.map((q, idx) => ({ id: q, index: idx }))

  // add labels to nodes
  selectedData.forEach(item => {
    const toIndex = items.indexOf(item[to])
    const fromIndex = items.indexOf(item[from])
    nodes[toIndex]['label'] = item[label_to] ? item[label_to] : ''
    nodes[fromIndex]['label'] = item[label_from] ? item[label_from] : ''
    nodes[toIndex]['color'] = item[color_to] ? item[color_to] : null
    nodes[fromIndex]['color'] = item[color_from] ? item[color_from] : null
    //nodes[toIndex]['tooltipHTML'] = getSingleTooltipHTML(item, props.header)
    //nodes[fromIndex]['tooltipHTML'] = getSingleTooltipHTML(item, props.header)
  })

  // links
  const links = selectedData
    .filter(item => item[from] && item[to]) // make sure both nodes exist
    .map((item, idx) => ({
      index: idx,
      source: link_index
        ? items.findIndex(element => element === item[from])
        : item[from],
      target: link_index
        ? items.findIndex(element => element === item[to])
        : item[to],
      edgeLabel: item[edge_label],
      value: relation != null ? parseData(item[relation]) : 1,
      tooltipHTML: getSingleTooltipHTML(item, props.header)
    }))

  return { nodes, links }
}

export function getValues(props) {
  const value = props.header[props.settings['value']]
  const label = props.header[props.settings['label']]
  const color = props.header[props.settings['color']]
  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )

  const parseData =
    props.dataTypes[props.settings['value']] === 'number'
      ? parseFloat
      : d => moment(d).year() + moment(d).dayOfYear() / 366 // convert date to year

  let values = selectedData.map(item => parseData(item[value]))
  let labels =
    label != null
      ? selectedData.map(
          item => (item[label] != null ? String(item[label]) : '')
        )
      : Array(values.length).fill('')
  let colorLabels =
    color != null
      ? selectedData.map(item => (item[color] != null ? item[color] : null))
      : Array(values.length).fill(null)
  let tooltipHTMLs = getTooltipHTML(props)

  let [colors, colorScale] = getColors(props, true)

  // remove zero and negative values
  let invalid_indices = []
  values = values.filter((value, i) => {
    if (value == null || value <= 0) {
      invalid_indices.push(i)
      return false
    } else {
      return true
    }
  })
  labels = labels.filter((_, i) => !invalid_indices.includes(i))
  colors = colors.filter((_, i) => !invalid_indices.includes(i))
  colorLabels = colorLabels.filter((_, i) => !invalid_indices.includes(i))
  tooltipHTMLs = tooltipHTMLs.filter((_, i) => !invalid_indices.includes(i))

  if (typeof colorScale.range === 'function') {
    const newDomain = colorScale
      .domain()
      .filter(v => colorLabels.includes(v) && v != null)
    colorScale = colorScale
      .range(newDomain.map(v => colorScale(v)))
      .domain(newDomain)
  }

  const data = values.map((val, i) => ({ value: values[i], label: labels[i] }))

  return [data, colors, colorScale, tooltipHTMLs]
}

export function getGroupValues(props, uniqueXValues = true) {
  let x_label = ''
  if (props.chartId === 1.18) {
    // bar chart
    x_label = props.header[props.settings['x-axis-all']]
  } else if (props.chartId === 1.19) {
    // radar chart
    x_label = props.header[props.settings['axes']]
  } else if (props.chartId === 1.23) {
    // pie chart map
    x_label = props.header[props.settings['label']]
  }

  const ngroups = props.settings['ngroups']
  const group_indices = [...Array(ngroups).keys()]
  const y_labels = group_indices.map(group_idx => {
    const setting =
      group_idx > 0 ? `y-axis-groups${group_idx}` : 'y-axis-groups'
    return props.header[props.settings[setting]]
  })

  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )
  let x_values
  if (uniqueXValues) {
    // unique values
    x_values = [...new Set(selectedData.map(item => item[x_label]))]
  } else {
    // allow duplicate values
    x_values = selectedData.map(item => item[x_label])
  }

  // initialized values
  let y_values = group_indices.map(i => Array(x_values.length).fill(0))

  // fill values
  selectedData.forEach((item, i) => {
    const x_idx = uniqueXValues ? x_values.indexOf(item[x_label]) : i

    group_indices.forEach(group_idx => {
      const setting =
        group_idx > 0 ? `y-axis-groups${group_idx}` : 'y-axis-groups'
      const parseData =
        props.dataTypes[props.settings[setting]] === 'number'
          ? parseFloat
          : d => moment(d).year() + moment(d).dayOfYear() / 366 // convert date to year

      const val = parseData(item[y_labels[group_idx]])
      if (val > 0) y_values[group_idx][x_idx] = val
    })
  })

  // remove all zero values
  let zero_indices = []
  if (uniqueXValues) {
    x_values.forEach((_, x_idx) => {
      if (
        group_indices
          .map(group_idx => y_values[group_idx][x_idx])
          .reduce((a, b) => a + b, 0) === 0
      ) {
        zero_indices.push(x_idx)
      }
    })
    x_values = x_values.filter((_, x_idx) => !zero_indices.includes(x_idx))
    y_values.forEach((_, group_idx) => {
      y_values[group_idx] = y_values[group_idx].filter(
        (_, x_idx) => !zero_indices.includes(x_idx)
      )
    })
  }

  // tooltips
  let tooltipHTMLs = x_values.map(val => '')
  selectedData.forEach((item, i) => {
    const x_idx = uniqueXValues ? x_values.indexOf(item[x_label]) : i
    tooltipHTMLs[x_idx] = getSingleTooltipHTML(item, props.header)
  })

  // colors
  const colorScale = getColorScaleFromValues(y_labels, props.moreSettings.color)

  if (props.chartId === 1.18) {
    // bar chart
    const colors = y_labels.map(val => colorScale(val))
    return [x_values, y_values, colors, colorScale, tooltipHTMLs]
  } else if (props.chartId === 1.19) {
    // radar chart
    const data = {
      variables: x_values.map(val => ({
        key: String(val),
        label: String(val)
      })),
      sets: y_values.map((group_vals, group_idx) => {
        let set = {}
        set['key'] = y_labels[group_idx]
        set['label'] = y_labels[group_idx]
        set['values'] = {}
        group_vals.forEach((val, x_idx) => {
          set.values[x_values[x_idx]] = val
        })
        return set
      })
    }
    let colors = {}
    y_labels.forEach((val, group_idx) => {
      colors[y_labels[group_idx]] = colorScale(val)
    })
    const maxVal = Math.max(...[].concat.apply([], y_values))

    return [data, maxVal, colors, colorScale, tooltipHTMLs]
  } else if (props.chartId === 1.23) {
    // pie chart map
    return [x_values, y_values, y_labels, tooltipHTMLs]
  }
}

export function getSingleTooltipHTML(item, header) {
  return header
    .map(header => {
      const value =
        item[header] != null
          ? item[header]
          : '<span class="text-muted">(no data)</span>'
      return `<span><b>${header}</b> ${value}</span>`
    })
    .join('<br />')
    .replace(/display="block"/, 'display="inline"') // inline math formula
}

export function getTooltipHTML(props) {
  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )

  const html = selectedData.map(item =>
    getSingleTooltipHTML(item, props.header)
  )

  return html
}

export function getWordCloudData(props, segmenter) {
  const [minFontSize, maxFontSize] = props.moreSettings.fontSizes

  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )
  const textLabel = props.header[props.settings['texts']]
  const delimiter = props.moreSettings.delimiter

  let texts = ''
  selectedData.forEach(item => {
    if (item[textLabel] != null) {
      let string = String([item[textLabel]])
      if (props.moreSettings.case === 'lower case')
        string = string.toLowerCase()
      if (props.moreSettings.case === 'upper case')
        string = string.toUpperCase()
      if (['Chinese', 'Japanese'].includes(delimiter)) {
        texts += ` ${string}`
      } else {
        texts += `${delimiter}${string}`
      }
    }
  })

  // remove extra spaces
  texts = texts.replace(/\s+/g, ' ')

  let splitted_texts = []

  // split
  if (delimiter === 'Chinese' || delimiter === 'Japanese') {
    if (segmenter != null) {
      splitted_texts =
        typeof segmenter.doSegment === 'function'
          ? segmenter.doSegment(texts).map(s => s.w)
          : segmenter.segment(texts).filter(s => s !== ' ')
    } else {
      splitted_texts = texts.split(' ').slice(1)
    }
  } else {
    splitted_texts = texts.split(delimiter).slice(1)
  }

  // count word occurences
  let data = {}
  splitted_texts.forEach((word, i) => {
    if (!data[word]) data[word] = 0
    ++data[word]
  })

  const minCount = Math.min(...Object.values(data))
  const maxCount = Math.max(...Object.values(data))

  // calculate font sizes
  let calcFontSize = (
    count // log scale
  ) =>
    maxCount !== minCount
      ? (Math.log(count) - Math.log(minCount)) /
          (Math.log(maxCount) - Math.log(minCount)) *
          (maxFontSize - minFontSize) +
        minFontSize
      : (maxFontSize + minFontSize) / 2
  if (props.moreSettings.sizeScale === 'linear') {
    calcFontSize = (
      count // linear scale
    ) =>
      maxCount !== minCount
        ? (count - minCount) /
            (maxCount - minCount) *
            (maxFontSize - minFontSize) +
          minFontSize
        : (maxFontSize + minFontSize) / 2
  }

  data = Object.keys(data).map(word => ({
    text: word,
    count: data[word],
    fontSize: calcFontSize(data[word])
  }))

  const colors = data.map(word =>
    colorSchemes[props.moreSettings.color](Math.random())
  )

  return [data, colors]
}

export function getTimeData(props) {
  const start_label = props.header[props.settings['start-time']]
  const end_label = props.header[props.settings['end-time']]
  const label = props.header[props.settings['label']]
  const color = props.header[props.settings['color']]

  const selectedData = props.data.filter((item, i) =>
    props.rowSelections.includes(i)
  )

  let [colors, colorScale] = getColors(props, true)
  let tooltipHTMLs = getTooltipHTML(props)
  let invalid_indices = []

  let data = []
  selectedData.forEach((item, i) => {
    const start_time =
      item[start_label] != null ? new Date(item[start_label]) : null
    const end_time = item[end_label] != null ? new Date(item[end_label]) : null
    if (
      start_time != null &&
      end_time != null &&
      !isNaN(start_time.getTime()) &&
      !isNaN(end_time.getTime())
    ) {
      data.push({
        start: start_time,
        end: end_time,
        label: item[label] != null ? String(item[label]) : ''
      })
    } else {
      invalid_indices.push(i)
    }
  })

  const minDate = new Date(Math.min(...data.map(period => period.start)))
  const maxDate = new Date(Math.max(...data.map(period => period.end)))

  let colorLabels =
    color != null
      ? selectedData.map(item => (item[color] != null ? item[color] : null))
      : Array(data.length).fill(null)

  colors = colors.filter((_, i) => !invalid_indices.includes(i))
  colorLabels = colorLabels.filter((_, i) => !invalid_indices.includes(i))
  tooltipHTMLs = tooltipHTMLs.filter((_, i) => !invalid_indices.includes(i))

  if (typeof colorScale.range === 'function') {
    const newDomain = colorScale
      .domain()
      .filter(v => colorLabels.includes(v) && v != null)
    colorScale = colorScale
      .range(newDomain.map(v => colorScale(v)))
      .domain(newDomain)
  }

  return [data, minDate, maxDate, colors, colorScale, tooltipHTMLs]
}

export function getCoordArray(coordString) {
  return coordString
    .slice(1, -1)
    .split(', ')
    .map(parseFloat)
}
