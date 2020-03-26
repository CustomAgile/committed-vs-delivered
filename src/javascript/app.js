/* global Ext Rally Constants Utils */
Ext.define("committed-vs-delivered", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [
        {
            xtype: 'tabpanel',
            itemId: 'filterAndSettingsPanel',
            header: false,
            collapsible: true,
            animCollapse: false,
            cls: 'blue-tabs',
            activeTab: 0,
            plain: true,
            // hideMode: 'offsets',
            tabBar: {
                margin: '0 0 0 100'
            },
            autoRender: true,
            minTabWidth: 140,
            items: [
                {
                    title: 'Filters',
                    html: '',
                    itemId: 'filtersTab',
                    padding: 5,
                    items: [
                        {
                            id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
                            xtype: 'container',
                            layout: {
                                type: 'hbox',
                                align: 'middle',
                                defaultMargins: '0 10 10 0',
                            }
                        }, {
                            id: Utils.AncestorPiAppFilter.PANEL_RENDER_AREA_ID,
                            xtype: 'container',
                            layout: {
                                type: 'hbox',
                                align: 'middle',
                                defaultMargins: '0 10 10 0',
                            }
                        },
                    ]
                },
                {
                    title: 'Settings',
                    html: '',
                    itemId: 'settingsTab',
                    padding: 10,
                }
            ]
        },
        {
            xtype: 'container',
            itemId: 'controls-area',
            layout: 'hbox',
            margin: '10 0 0 0'
        },
        {
            id: 'grid-area',
            xtype: 'container',
            flex: 1,
            type: 'vbox',
            align: 'stretch'
        }
    ],
    config: {
        defaultSettings: {
            artifactType: 'HierarchicalRequirement',
            timeboxType: Constants.TIMEBOX_TYPE_ITERATION,
            timeboxCount: 5,
            planningWindow: 2,
            currentTimebox: true,
            respectTimeboxFilteredPage: false
        }
    },

    integrationHeaders: {
        name: "committed-vs-delivered"
    },

    currentData: [],
    // settingsChanged: false,

    launch: async function () {
        Rally.data.wsapi.Proxy.superclass.timeout = 180000;
        Rally.data.wsapi.batch.Proxy.superclass.timeout = 180000;

        this.down('#grid-area').on('resize', this.resizeChart, this);

        this.loading = true;
        this.projects = await this._getProjectList();

        if (!this.projects || !this.projects.length) {
            this._showError('Failed to fetch list of project IDs');
            return;
        }

        this.collapseBtn = Ext.widget('rallybutton', {
            // xtype: 'rallybutton',
            text: 'Collapse',
            floating: true,
            shadow: false,
            height: 21,
            handler: (btn) => {
                this.down('#filterAndSettingsPanel').toggleCollapse();
                if (btn.getText() === 'Collapse') {
                    btn.setText('Expand');
                }
                else {
                    btn.setText('Collapse');
                }
            }
        });

        this.collapseBtn.showBy(this.down('#filterAndSettingsPanel'), 'tl-tl', [0, 3]);

        this.addSettingItems();

        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            settingsConfig: {},
            whiteListFields: [
                'Tags',
                'Milestones',
                'c_EnterpriseApprovalEA',
                'c_EAEpic'
            ],
            filtersHidden: false,
            visibleTab: this.down('#artifactTypeCombo').getValue(),
            listeners: {
                scope: this,
                ready(plugin) {
                    Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                        scope: this,
                        success(portfolioItemTypes) {
                            this.portfolioItemTypes = _.sortBy(portfolioItemTypes, function (type) {
                                return type.get('Ordinal');
                            });
                            this.lowestPiType = this.portfolioItemTypes[0];
                            this.setModelFieldsForType(this.down('#artifactTypeCombo').getValue());
                            this.setTimeboxFieldsForType(this.down('#timeboxTypeCombo').getValue());

                            plugin.addListener({
                                scope: this,
                                select: this.filtersChange,
                                change: this.filtersChange
                            });

                            this.loading = false;
                            this.filtersChange();
                        },
                        failure(msg) {
                            this._showError(msg);
                        },
                    });
                },
            }
        });
        this.addPlugin(this.ancestorFilterPlugin);
    },


    onTimeboxScopeChange: function () {
        this.callParent(arguments);
        this.viewChange();
    },

    filtersChange: async function () {
        this.ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(this.down('#artifactTypeCombo').getValue(), true).catch((e) => {
            Rally.ui.notify.Notifier.showError({ message: (e.message || e) });
        });

        if (this.ancestorAndMultiFilters) {
            this.viewChange();
        }
    },

    setModelFieldsForType: function (artifactType) {
        this.modelName = artifactType;
        this.acceptedDateField = 'AcceptedDate';
        if (this.isPiTypeSelected()) {
            this.acceptedDateField = 'ActualEndDate'
        }
    },

    setTimeboxFieldsForType: function (timeboxType) {
        this.timeboxType = timeboxType;

        if (this.timeboxType == Constants.TIMEBOX_TYPE_RELEASE) {
            this.timeboxStartDateField = 'ReleaseStartDate';
            this.timeboxEndDateField = 'ReleaseDate';
        }
        else if (this.timeboxType == Constants.TIMEBOX_TYPE_ITERATION) {
            this.timeboxStartDateField = 'StartDate';
            this.timeboxEndDateField = 'EndDate'
        }
    },

    /**
     * Return a promise that resolves once the controls are initialized and
     * have initial values
     */
    addControls: function () {
        // var filterDeferred = Ext.create('Deft.Deferred');
        var context = this.getContext();
        var controlsArea = this.down('#controls-area');
        controlsArea.removeAll();
        controlsArea.add([
            {
                xtype: 'container',
                flex: 1
            }, {
                xtype: 'tsfieldpickerbutton',
                margin: '0 10 0 0',
                toolTipConfig: {
                    html: 'Columns to Export',
                    anchor: 'top'
                },
                getTitle: function () {
                    return 'Export Columns';
                },
                modelNames: [this.modelName],
                _fields: this.isPiTypeSelected() ? Constants.PI_DEFAULT_FIELDS : Constants.STORY_DEFAULT_FIELDS,
                context: context,
                stateful: true,
                stateId: context.getScopedStateId(this.modelName + 'fields'), // columns specific to type of object
                // Always need the accepted date field
                alwaysSelectedValues: Constants.ALWAYS_SELECTED_FIELDS.concat(this.acceptedDateField),
                listeners: {
                    fieldsupdated: function (fields) {
                        this.viewChange();
                    },
                    scope: this
                }
            }, {
                xtype: 'rallybutton',
                style: { 'float': 'right' },
                cls: 'secondary rly-small',
                frame: false,
                itemId: 'actions-menu-button',
                iconCls: 'icon-export',
                listeners: {
                    click: function (button) {
                        var menu = Ext.widget({
                            xtype: 'rallymenu',
                            items: [{
                                text: 'Export to CSV...',
                                handler: function () {
                                    var csvText = this.convertDataArrayToCSVText(this.currentData, this.getExportFieldsHash());
                                    CArABU.technicalservices.FileUtilities.saveCSVToFile(csvText, 'committed.csv');
                                },
                                scope: this
                            }]
                        });
                        menu.showBy(button.getEl());
                        if (button.toolTip) {
                            button.toolTip.hide();
                        }
                    },
                    scope: this
                }
            }]);
    },

    convertDataArrayToCSVText: function (data_array, requestedFieldHash) {
        var text = '';
        Ext.each(Object.keys(requestedFieldHash), function (key) {
            text += requestedFieldHash[key] + ',';
        });
        text = text.replace(/,$/, '\n');

        Ext.each(data_array, function (d) {
            Ext.each(Object.keys(requestedFieldHash), function (key) {
                if (d[key]) {
                    let val = CustomAgile.ui.renderer.RecordFieldRendererFactory.getFieldDisplayValue(d, key, '; ');
                    text += Ext.String.format("\"{0}\",", val);
                }
                else {
                    text += ',';
                }
            }, this);
            text = text.replace(/,$/, '\n');
        }, this);
        return text;
    },

    getFieldsFromButton: function () {
        var fieldPicker = this.down('tsfieldpickerbutton');
        var result = [];
        if (fieldPicker) {
            result = fieldPicker.getFields();
        }
        return result;
    },

    getExportFieldsHash: function () {
        var fields = this.getFieldsFromButton();
        // Special case, add the accepted date after all fields from the field picker so it
        // is next to the derirved fields instead of in the first column of export.
        // Use _.unique to remove duplicate as that field is also always selected.
        fields = _.without(fields, this.acceptedDateField);
        fields.push(this.acceptedDateField);
        fields = fields.concat(Constants.DERIVED_FIELDS);
        return _.reduce(fields, function (accum, field) {
            accum[field] = this.headerName(field);
            return accum;
        }, {}, this);
    },

    headerName: function (field) {
        var result;
        switch (field) {
            case "Iteration":
                result = 'Currently linked to Iteration'
                break;
            case "Release":
                result = 'Currently linked to Release'
                break;
            case 'timeboxName':
                result = this.timeboxType;
                break;
            case 'timeboxStartDate':
                result = this.timeboxType + ' Start Date';
                break;
            case 'timeboxEndDate':
                result = this.timeboxType + ' End Date';
                break;
            case 'timeboxAddedDate':
                result = 'Linked to ' + this.timeboxType + ' on';
                break;
            default:
                result = field;
        }

        return result;
    },

    // Usual monkey business to size gridboards
    resizeChart: function () {
        // this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },

    _buildChartConfig: function () {
        // Get the last N timeboxes
        return this.getTimeboxes().then({
            scope: this,
            success: function (timeboxGroups) {
                var promises = _.map(timeboxGroups, function (timeboxGroup) {
                    var timebox = timeboxGroup[0]; // Representative timebox for the group
                    var planningWindowEndIso = Ext.Date.add(timebox.get(this.timeboxStartDateField), Ext.Date.DAY, this.down('#planningWindowInput').getValue()).toISOString();
                    var timeboxEndIso = timebox.get(this.timeboxEndDateField).toISOString();
                    var timeboxStartIso = timebox.get(this.timeboxStartDateField).toISOString();
                    var snapshotByOid = {}
                    return this.getSnapshotsFromTimeboxGroup(timeboxGroup).then({
                        scope: this,
                        success: function (snapshots) {
                            if (!snapshots || snapshots.length == 0) {
                                return {
                                    timebox: timebox,
                                    artifactStore: null
                                }
                            }
                            else {
                                var oidQueries = [];
                                _.each(snapshots, function (snapshot) {
                                    let oid = snapshot.get('ObjectID');
                                    oidQueries.push(snapshot.get('ObjectID'));
                                    snapshotByOid[oid] = snapshot;
                                }, this);

                                // We can't get other data like accepted date
                                // as part of the planned/unplanned lookback query because then we'd have
                                // to compress potentially many snapshots on the client side.
                                var filters = new Rally.data.wsapi.Filter({
                                    property: 'ObjectID',
                                    operator: 'in',
                                    value: oidQueries
                                });

                                if (this.ancestorAndMultiFilters && this.ancestorAndMultiFilters.length) {
                                    filters = filters.and(Rally.data.wsapi.Filter.and(this.ancestorAndMultiFilters));
                                }

                                var timeboxScope = this.getContext().getTimeboxScope();
                                if (timeboxScope && this.getSetting('respectTimeboxFilteredPage')) {
                                    if (timeboxScope.type === 'iteration' && this.modelName === 'PortfolioItem/Feature') { }
                                    else {
                                        filters = filters.and(timeboxScope.getQueryFilter());
                                    }
                                }

                                var artifactStore = Ext.create('Rally.data.wsapi.Store', {
                                    model: this.modelName,
                                    fetch: this.getFieldsFromButton(),
                                    autoLoad: false,
                                    enablePostGet: true,
                                    filters: filters
                                });
                                return artifactStore.load().then({
                                    scope: this,
                                    success: function (artifacts) {
                                        // Augment each artifact with Planned, Delivered and timebox Added Date
                                        _.each(artifacts, function (artifact) {
                                            var snapshot = snapshotByOid[artifact.get('ObjectID')];
                                            var validFrom = snapshot.get('_ValidFrom')
                                            if (validFrom <= planningWindowEndIso) {
                                                artifact.set('Planned', true);
                                            }
                                            var acceptedDate = artifact.get(this.acceptedDateField);
                                            if (acceptedDate) {
                                                var acceptedIso = acceptedDate.toISOString();
                                                if (acceptedIso <= timeboxEndIso) {
                                                    artifact.set('Delivered', true);
                                                }
                                                // Special case where artifact may be assigned to timeboxes that occur after
                                                // its accepted date. We may want to render these differently so they don't
                                                // show up as 'Delivered' in multiple timeboxes.
                                                if (acceptedIso < timeboxStartIso) {
                                                    artifact.set('AcceptedBeforeTimeboxStart', true);
                                                }
                                            }
                                            artifact.set('timeboxAddedDate', new Date(validFrom));
                                            artifact.set('timeboxName', timebox.get('Name'));
                                            artifact.set('timeboxStartDate', timebox.get(this.timeboxStartDateField));
                                            artifact.set('timeboxEndDate', timebox.get(this.timeboxEndDateField))
                                        }, this);
                                        return {
                                            timebox: timebox,
                                            artifactStore: artifactStore
                                        }
                                    },
                                    failure: function (e) {
                                        this._showError('Failed while loading Features');
                                        this.setLoading(false);
                                    }
                                });
                            }
                        }
                    })
                }, this);
                return Deft.Promise.all(promises)
            }
        }).then({
            scope: this,
            success: function (data) {
                this.data = data;
                return this.getChartConfig(this.data);
            }
        });
    },

    getChartConfig: function (data) {
        var sortedData = _.sortBy(data, function (datum) {
            return datum.timebox.get(this.timeboxStartDateField).toISOString();
        }, this);
        var timeboxNames = [];
        var plannedCommitted = [];
        var plannedDelivered = [];
        var unplannedComitted = [];
        var unplannedDelivered = [];
        this.currentData = [];
        _.each(sortedData, function (datum, index, collection) {
            var pc = 0,
                pd = 0,
                uc = 0,
                ud = 0;

            var timeboxName = datum.timebox.get('Name');
            // If this is the current in-progress timebox, annotate its name
            if (this.down('#currentTimeboxCheckbox').getValue() && index == collection.length - 1) {
                if (datum.timebox.get(this.timeboxEndDateField) >= new Date()) {
                    timeboxName = timeboxName + Constants.IN_PROGRESS;
                }
            }
            timeboxNames.push(timeboxName);

            if (datum.artifactStore) {
                datum.artifactStore.each(function (artifact) {
                    if (artifact.get('AcceptedBeforeTimeboxStart')) {
                        // Special case. The artifact was accepted before the timebox started. The work occurred
                        // *before* this timebox started and is NOT therefore included in the timebox as committed
                        // or delivered.
                    }
                    else {
                        this.currentData.push(artifact.data);
                        if (artifact.get('Planned')) {
                            pc++; // Committed and planned
                            if (artifact.get('Delivered')) {
                                pd++ // Planned and delivered
                            }
                        }
                        else {
                            uc++; // Comitted and unplanned 
                            if (artifact.get('Delivered')) {
                                ud++ // Unplanned and delivered
                            }
                        }
                    }
                }, this);
            }
            plannedCommitted.push(pc);
            plannedDelivered.push(pd);
            unplannedComitted.push(uc);
            unplannedDelivered.push(ud);
        }, this);

        var title = "Stories";
        if (this.isPiTypeSelected()) {
            title = this.lowestPiType.get('Name') + 's';
        }
        return {
            xtype: 'rallychart',
            loadMask: false,
            chartColors: [
                "#FAD200", // $yellow
                "#8DC63F", // $lime
            ],
            chartConfig: {
                chart: {
                    type: 'column',
                    animation: false
                },
                title: {
                    text: title + ' ' + Constants.CHART_TITLE + ' by ' + this.timeboxType
                },
                legend: {
                    layout: 'vertical',
                    labelFormatter: function () {
                        var result = this.name;
                        if (this.name == Constants.UNPLANNED) {
                            var app = Rally.getApp();
                            var timeboxType = app.down('#timeboxTypeCombo').getValue();
                            var days = app.down('#planningWindowInput').getValue();
                            result = `${this.name} (added to ${timeboxType} more than ${days} day${days > 1 ? 's' : ''} after start)`;
                        }
                        return result;
                    }
                },
                plotOptions: {
                    column: {
                        stacking: 'normal'
                    },
                    series: {
                        animation: false,
                        dataLabels: {
                            align: 'center',
                            verticalAlign: 'top',
                        },
                        events: {
                            legendItemClick: function () { return false; } // Disable hiding some of data on legend click
                        }
                    }
                },
                yAxis: {
                    allowDecimals: false,
                    title: {
                        text: Constants.Y_AXIS_TITLE
                    }
                }
            },
            chartData: {
                categories: timeboxNames,
                series: [{
                    dataLabels: {
                        enabled: true,
                        format: '{total} ' + Constants.COMMITTED,
                        inside: false,
                        y: -20,
                        overflow: 'justify'
                    },
                    data: unplannedComitted,
                    stack: 0,
                    legendIndex: 2,
                    name: Constants.UNPLANNED
                }, {
                    data: plannedCommitted,
                    stack: 0,
                    legendIndex: 1,
                    name: Constants.PLANNED
                }, {
                    dataLabels: {
                        enabled: true,
                        format: '{total} ' + Constants.DELIVERED,
                        inside: false,
                        y: -20,
                        overflow: 'justify'
                    },
                    data: unplannedDelivered,
                    stack: 1,
                    showInLegend: false,
                    name: Constants.UNPLANNED
                }, {
                    data: plannedDelivered,
                    stack: 1,
                    showInLegend: false,
                    name: Constants.PLANNED
                }]
            }
        }
    },

    getTimeboxes: function () {
        // Get the N most recent timeboxes in the current project
        // Sort by name
        // Get timeboxes by name from all child projects

        var timeboxFilterProperty = this.timeboxEndDateField;
        if (this.down('#currentTimeboxCheckbox').getValue()) {
            timeboxFilterProperty = this.timeboxStartDateField;
        }
        return Ext.create('Rally.data.wsapi.Store', {
            model: this.timeboxType,
            autoLoad: false,
            context: {
                projectScopeDown: false,
                projectScopeUp: false
            },
            sorters: [{
                property: timeboxFilterProperty,
                direction: 'DESC'
            }],
            filters: [{
                property: timeboxFilterProperty,
                operator: '<=',
                value: 'today'
            }],
            pageSize: this.down('#timeboxCountInput').getValue()
        }).load().then({
            scope: this,
            success: function (timeboxes) {
                var timeboxFilter = _.map(timeboxes, function (timebox) {
                    return Rally.data.wsapi.Filter.and([{
                        property: 'Name',
                        value: timebox.get('Name')
                    }, {
                        property: this.timeboxStartDateField,
                        value: timebox.get(this.timeboxStartDateField)
                    }, {
                        property: this.timeboxEndDateField,
                        value: timebox.get(this.timeboxEndDateField)
                    }]);
                }, this);
                if (timeboxFilter.length) {
                    return Rally.data.wsapi.Filter.or(timeboxFilter)
                }
                else {
                    return null;
                }
            }
        }).then({
            scope: this,
            success: function (timeboxFilter) {
                if (timeboxFilter) {
                    return Ext.create('Rally.data.wsapi.Store', {
                        model: this.timeboxType,
                        autoLoad: false,
                        fetch: ['ObjectID', this.timeboxStartDateField, this.timeboxEndDateField, 'Name'],
                        enablePostGet: true,
                        sorters: [{
                            property: this.timeboxEndDateField,
                            direction: 'DESC'
                        }],
                        filters: [timeboxFilter]
                    }).load()
                }
                else {
                    return [];
                }
            }
        }).then({
            scope: this,
            success: function (timeboxes) {
                // Group by timebox name
                return _.groupBy(timeboxes, function (timebox) {
                    return timebox.get('Name');
                });
            }
        })
    },

    getSnapshotsFromTimeboxGroup: function (timeboxGroup) {
        var timebox = timeboxGroup[0]; // Representative timebox for the group
        var timeboxOids = _.map(timeboxGroup, function (timebox) {
            return timebox.get('ObjectID');
        });
        var timeboxEndIso = timebox.get(this.timeboxEndDateField).toISOString();
        var planningWindowEndIso = Ext.Date.add(timebox.get(this.timeboxStartDateField), Ext.Date.DAY, this.down('#planningWindowInput').getValue()).toISOString();
        var dateFilter = Rally.data.lookback.QueryFilter.and([{
            property: '_ValidFrom',
            operator: '<=',
            value: timeboxEndIso
        },
        {
            property: '_ValidTo',
            operator: '>=',
            value: planningWindowEndIso
        }
        ]);
        var dataContext = this.getContext().getDataContext();

        var filters = [{
            property: '_TypeHierarchy',
            value: this.modelName
        },
        {
            property: this.timeboxType,
            operator: 'in',
            value: timeboxOids
        },
            dateFilter
        ];

        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        else {
            filters.push({
                property: 'Project',
                operator: 'in',
                value: this.projects// Rally.util.Ref.getOidFromRef(dataContext.project)
            });
        }

        var store = Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad: false,
            context: dataContext,
            fetch: [this.timeboxType, '_ValidFrom', '_ValidTo', 'ObjectID'],
            hydrate: [this.timeboxType],
            remoteSort: false,
            compress: true,
            enablePostGet: true,
            filters: filters,
        });
        return store.load();
    },

    async _getProjectList() {
        let projectStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['Name', 'ObjectID', 'Children'],
            filters: [{ property: 'ObjectID', value: this.getContext().getProject().ObjectID }],
            limit: 1,
            pageSize: 1,
            autoLoad: false
        });

        let results = await projectStore.load();
        if (results) {
            let projects = await this._getAllChildProjects(results);
            let projectIds = _.map(projects, (p) => {
                return p.get('ObjectID');
            });
            return projectIds;
        }
        else {
            return [];
        }
    },

    async _getAllChildProjects(allRoots = [], fetch = ['Name', 'Children', 'ObjectID']) {
        if (!allRoots.length) { return []; }

        const promises = allRoots.map(r => this._wrap(r.getCollection('Children', { fetch, limit: Infinity }).load()));
        const children = _.flatten(await Promise.all(promises));
        const decendents = await this._getAllChildProjects(children, fetch);
        const removeDupes = {};
        let finalResponse = _.flatten([...decendents, ...allRoots, ...children]);

        // eslint-disable-next-line no-return-assign
        finalResponse.forEach(s => removeDupes[s.get('_ref')] = s);
        finalResponse = Object.values(removeDupes);
        return finalResponse;
    },

    async _wrap(deferred) {
        if (!deferred || !_.isFunction(deferred.then)) {
            return Promise.reject(new Error('Wrap cannot process this type of data into a ECMA promise'));
        }
        return new Promise((resolve, reject) => {
            deferred.then({
                success(...args) {
                    resolve(...args);
                },
                failure(error) {
                    reject(error);
                }
            });
        });
    },

    _addGridboard: function (chartConfig) {
        var gridArea = this.down('#grid-area')
        gridArea.removeAll();

        var context = this.getContext();
        this.gridboard = gridArea.add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: [this.modelName],
            toggleState: 'chart',
            height: gridArea.getHeight() - Constants.APP_RESERVED_HEIGHT,
            chartConfig: chartConfig,
            listeners: {
                scope: this,
                viewchange: this.viewChange,
            }
        });
    },

    isPiTypeSelected: function () {
        return this.modelName.toLowerCase().indexOf('portfolioitem') > -1;
    },

    addSettingItems: function () {
        var timeboxTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: Constants.TIMEBOX_TYPE_ITERATION_LABEL, value: Constants.TIMEBOX_TYPE_ITERATION },
                { name: Constants.TIMEBOX_TYPE_RELEASE_LABEL, value: Constants.TIMEBOX_TYPE_RELEASE },
            ]
        });
        var typeStoreData = [
            { name: 'User Story', value: 'HierarchicalRequirement' },
            { name: 'Feature', value: 'PortfolioItem/Feature' }
        ];

        var artifactTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: typeStoreData
        });

        let context = this.getContext();

        this.down('#settingsTab').add([{
            xtype: 'combobox',
            name: 'artifactType',
            itemId: 'artifactTypeCombo',
            value: this.getSetting('artifactType'),
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-artifact-type-combo'),
            stateEvents: ['change'],
            fieldLabel: 'Artifact type',
            labelWidth: 200,
            store: artifactTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    this.setModelFieldsForType(newValue);

                    // If Feature, also update timebox type to 'Release' and disable
                    // If change is fired due to setting state, timebox type 
                    // hasn't been created yet, so wait a bit first
                    setTimeout(() => {
                        let timeboxTypeControl = this.down('#timeboxTypeCombo');
                        if (timeboxTypeControl) {
                            if (this.isPiTypeSelected()) {
                                timeboxTypeControl.setValue(Constants.TIMEBOX_TYPE_RELEASE);
                                timeboxTypeControl.disable(); // User cannot pick other timeboxes for Features
                            }
                            else {
                                timeboxTypeControl.enable();
                            }
                        }
                    }, 200);

                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplyBtn();
                    }
                }
            }
        },
        {
            xtype: 'combobox',
            id: 'timeboxTypeCombo',
            value: this.getSetting('timeboxType'),
            disabled: this.getSetting('artifactType') === 'PortfolioItem/Feature',
            fieldLabel: 'Timebox type',
            labelWidth: 200,
            store: timeboxTypeStore,
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-timebox-type-combo'),
            stateEvents: ['change'],
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    this.setTimeboxFieldsForType(newValue);

                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplyBtn();
                    }
                }
            }
        },
        {
            xtype: 'rallynumberfield',
            itemId: 'timeboxCountInput',
            value: this.getSetting('timeboxCount'),
            fieldLabel: "Timebox Count",
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-timebox-count-input'),
            stateEvents: ['change'],
            labelWidth: 200,
            minValue: 1,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    this.showApplyBtn();
                }
            }
        }, {
            xtype: 'rallynumberfield',
            itemId: 'planningWindowInput',
            value: this.getSetting('planningWindow'),
            fieldLabel: 'Timebox planning window (days)',
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-planning-window-input'),
            stateEvents: ['change'],
            labelWidth: 200,
            minValue: 0,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    this.showApplyBtn();
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            itemId: 'currentTimeboxCheckbox',
            value: this.getSetting('currentTimebox'),
            fieldLabel: 'Show current, in-progress timebox',
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-current-timebox-checkbox'),
            stateEvents: ['change'],
            labelWidth: 200,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplyBtn();
                    }
                }
            }
        },
        {
            xtype: 'rallybutton',
            itemId: 'applySettingsBtn',
            text: 'Apply',
            hidden: true,
            handler: function (btn) {
                btn.hide();
                this.viewChange();
            }.bind(this)
        }
        ]);
    },

    showApplyBtn: function () {
        this.down('#applySettingsBtn').show();
    },

    viewChange: function () {
        this.setLoading(true);
        this.addControls();

        this._buildChartConfig().then({
            scope: this,
            success: function (chartConfig) {
                this._addGridboard(chartConfig);
                this.setLoading(false);
                this.resizeChart();
            }
        });
    },

    searchAllProjects() {
        return this.ancestorFilterPlugin.getIgnoreProjectScope();
    },

    getModelScopedStateId: function (modelName, id) {
        return this.getContext().getScopedStateId(modelName + '-' + id);
    },

    getSettingsFields: function () {
        var timeboxTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: Constants.TIMEBOX_TYPE_ITERATION_LABEL, value: Constants.TIMEBOX_TYPE_ITERATION },
                { name: Constants.TIMEBOX_TYPE_RELEASE_LABEL, value: Constants.TIMEBOX_TYPE_RELEASE },
            ]
        });
        var typeStoreData = [
            { name: 'User Story', value: 'HierarchicalRequirement' },
            { name: 'Feature', value: 'PortfolioItem/Feature' },
        ];

        var artifactTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: typeStoreData
        });
        return [{
            xtype: 'combobox',
            name: 'artifactType',
            value: this.getSetting('artifactType'),
            fieldLabel: 'Artifact type',
            labelWidth: 150,
            store: artifactTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                artifactType: newValue
                            }
                        });
                        // Choice of artifact has changed
                        this.setModelFieldsForType(newValue);
                        // If Feature, also update timebox type to 'Release'
                        var timeboxTypeControl = Ext.ComponentManager.get('timeboxType');
                        if (this.isPiTypeSelected()) {
                            timeboxTypeControl.setValue(Constants.TIMEBOX_TYPE_RELEASE);
                            timeboxTypeControl.disable(); // User cannot pick other timeboxes for Features
                        }
                        else {
                            timeboxTypeControl.enable();
                        }
                    }
                }
            }
        },
        {
            xtype: 'combobox',
            name: 'timeboxType',
            id: 'timeboxType',
            value: this.getSetting('timeboxType'),
            fieldLabel: 'Timebox type',
            labelWidth: 150,
            store: timeboxTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            disabled: this.isPiTypeSelected(),
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                timeboxType: newValue
                            }
                        });
                        // Choice of timebox has changed
                        this.setTimeboxFieldsForType(newValue);
                    }
                }
            }
        },
        {
            xtype: 'rallynumberfield',
            name: 'timeboxCount',
            value: this.getSetting('timeboxCount'),
            fieldLabel: "Timebox Count",
            labelWidth: 150,
            minValue: 1,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                timeboxCount: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallynumberfield',
            name: 'planningWindow',
            value: this.getSetting('planningWindow'),
            fieldLabel: 'Timebox planning window (days)',
            labelWidth: 150,
            minValue: 0,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                planningWindow: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            name: 'currentTimebox',
            value: this.getSetting('currentTimebox'),
            fieldLabel: 'Show current, in-progress timebox',
            labelWidth: 150,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                currentTimebox: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            name: 'respectTimeboxFilteredPage',
            value: this.getSetting('respectTimeboxFilteredPage'),
            fieldLabel: 'Filter data by timebox on timebox filtered pages',
            labelWidth: 150,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                respectTimeboxFilteredPage: newValue
                            }
                        });
                    }
                }
            }
        }
        ]
    },

    _showError: function (msg) {
        Rally.ui.notify.Notifier.showError({ message: msg });
    },

    showSettings: function () {
        if (this.collapseBtn) {
            this.collapseBtn.hide();
        }
        this.callParent(arguments);
    },

    hideSettings: function () {
        if (this.collapseBtn) {
            this.collapseBtn.show();
        }
        this.callParent(arguments);
    }
});
